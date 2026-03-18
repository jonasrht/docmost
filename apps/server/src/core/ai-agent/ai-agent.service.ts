import { Injectable, Logger } from '@nestjs/common';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, tool, pipeAgentUIStreamToResponse } from 'ai';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageService } from '../page/services/page.service';
import { SpaceService } from '../space/services/space.service';
import { SearchService } from '../search/search.service';
import { User } from '@docmost/db/types/entity.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly pageService: PageService,
    private readonly spaceService: SpaceService,
    private readonly searchService: SearchService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  private getModel() {
    const driver = this.environmentService.getAiDriver();
    const modelName = this.environmentService.getAiCompletionModel();

    if (driver === 'openrouter') {
      const openrouter = createOpenRouter({
        apiKey: this.environmentService.getOpenRouterApiKey(),
      });
      return openrouter(modelName);
    }

    // Fallback for openai-compatible or direct openai
    const openai = createOpenAI({
      apiKey: this.environmentService.getOpenAiApiKey(),
      baseURL: this.environmentService.getOpenAiApiUrl(),
    });
    return openai(modelName);
  }

  async chat(
    res: ServerResponse,
    user: User,
    workspaceId: string,
    messages: any[],
    pageContext?: { id: string; title: string; content: string }[],
  ) {
    const model = this.getModel();

    let contextSection = '';
    if (pageContext?.length > 0) {
      contextSection = '\n\nReferenced Pages:\n' +
        pageContext
          .map(
            (p) =>
              `---\nPage: ${p.title} (ID: ${p.id})\n${p.content}\n---`,
          )
          .join('\n\n');
    }

    const agent = new ToolLoopAgent({
      model,
      instructions: `You are the Docmost AI Assistant. You help users manage their workspace, pages, and spaces.
      Current User: ${user.name} (ID: ${user.id})
      Workspace ID: ${workspaceId}

      You can read content, search for information, and create or update pages.
      Always be helpful and concise.${contextSection}`,
      tools: {
        listSpaces: tool({
          description: 'List all spaces you have access to in the workspace',
          inputSchema: z.object({}),
          execute: async () => {
            const spacesResult = await this.spaceMemberRepo.getUserSpaces(user.id, { limit: 100 } as any);
            return spacesResult.items.map(s => ({ id: s.id, name: s.name, slug: s.slug }));
          },
        }),
        getPagesInSpace: tool({
          description: 'Get all root pages in a specific space',
          inputSchema: z.object({
            spaceId: z.string().describe('The ID of the space'),
          }),
          execute: async ({ spaceId }) => {
            const pagesResult = await this.pageService.getSidebarPages(spaceId, { limit: 100 } as any);
            return pagesResult.items.map(p => ({ id: p.id, title: p.title, parentPageId: p.parentPageId }));
          },
        }),
        readPage: tool({
          description: 'Read the content of a specific page',
          inputSchema: z.object({
            pageId: z.string().describe('The ID of the page'),
          }),
          execute: async ({ pageId }) => {
            const page = await this.pageService.findById(pageId, true);
            if (!page) return 'Page not found';
            return {
              title: page.title,
              content: page.textContent || page.content,
            };
          },
        }),
        searchContent: tool({
          description: 'Search for content across the workspace',
          inputSchema: z.object({
            query: z.string().describe('The search query'),
          }),
          execute: async ({ query }) => {
            const results = await this.searchService.searchPage({ query, limit: 5 }, {
              userId: user.id,
              workspaceId,
            });
            return results.items.map(r => ({ title: r.title, pageId: r.id, excerpt: r.highlight }));
          },
        }),
        createPage: tool({
          description: 'Create a new page in a space',
          inputSchema: z.object({
            spaceId: z.string().describe('The ID of the space'),
            title: z.string().describe('The title of the page'),
            content: z.string().describe('The content of the page in Markdown format'),
            parentPageId: z.string().optional().describe('Optional ID of the parent page'),
          }),
          execute: async ({ spaceId, title, content, parentPageId }) => {
            const page = await this.pageService.create(user.id, workspaceId, {
              spaceId,
              title,
              content,
              parentPageId,
              format: 'markdown' as any,
            });
            return { id: page.id, title: page.title, slugId: page.slugId };
          },
        }),
        updatePage: tool({
          description: 'Update the content of an existing page',
          inputSchema: z.object({
            pageId: z.string().describe('The ID of the page'),
            content: z.string().describe('The new content of the page in Markdown format'),
          }),
          execute: async ({ pageId, content }) => {
            const page = await this.pageService.findById(pageId);
            if (!page) return 'Page not found';
            const updatedPage = await this.pageService.update(page, {
              pageId,
              content,
              format: 'markdown' as any,
              operation: 'replace',
            }, user);
            return { id: updatedPage.id, title: updatedPage.title };
          },
        }),
      },
    });

    return pipeAgentUIStreamToResponse({
      response: res,
      agent,
      uiMessages: messages,
    });
  }
}
