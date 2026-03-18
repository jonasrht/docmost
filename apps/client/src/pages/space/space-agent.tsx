import {
  ActionIcon,
  Badge,
  Box,
  CloseButton,
  Container,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { IconRobot, IconSend } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { queryClient } from "@/main";
import { getPageById } from "@/features/page/services/page-service";
import PageMentionDropdown, {
  MentionedPage,
} from "./page-mention-dropdown";

export default function SpaceAgent() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: space } = useSpaceQuery(spaceSlug);
  const viewport = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localInput, setLocalInput] = useState("");

  const [mentionedPages, setMentionedPages] = useState<MentionedPage[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionOpened = mentionQuery !== null;

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai-agent/chat" }),
  });

  const isLoading = status !== "ready";

  const scrollToBottom = () =>
    viewport.current?.scrollTo({
      top: viewport.current.scrollHeight,
      behavior: "smooth",
    });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (value: string) => {
    setLocalInput(value);

    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Don't show if there's a space right after @ (completed mention)
      if (!textAfterAt.includes(" ") || textAfterAt.indexOf(" ") > 0) {
        const query = textAfterAt.replace(/\s/g, "");
        setMentionQuery(query);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleMentionSelect = useCallback(
    (page: MentionedPage) => {
      if (mentionedPages.some((p) => p.id === page.id)) {
        setMentionQuery(null);
        return;
      }

      setMentionedPages((prev) => [...prev, page]);

      // Remove @query from input
      const cursorPos = inputRef.current?.selectionStart ?? localInput.length;
      const textBeforeCursor = localInput.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const newText =
          localInput.slice(0, lastAtIndex) + localInput.slice(cursorPos);
        setLocalInput(newText);
      }

      setMentionQuery(null);
    },
    [localInput, mentionedPages],
  );

  const removeMentionedPage = (pageId: string) => {
    setMentionedPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!localInput.trim() && mentionedPages.length === 0) || isLoading) return;

    const content = localInput;
    setLocalInput("");
    setMentionedPages([]);
    setMentionQuery(null);

    // Fetch page content for context
    let pageContext: { id: string; title: string; content: string }[] = [];
    if (mentionedPages.length > 0) {
      pageContext = await Promise.all(
        mentionedPages.map(async (page) => {
          try {
            const fullPage = await queryClient.fetchQuery({
              queryKey: ["pages", page.id],
              queryFn: () => getPageById({ pageId: page.id }),
              staleTime: 5 * 60 * 1000,
            });
            return {
              id: page.id,
              title: fullPage.title,
              content: fullPage.content || "",
            };
          } catch {
            return { id: page.id, title: page.title, content: "" };
          }
        }),
      );
    }

    await sendMessage(
      { text: content },
      pageContext.length > 0 ? { body: { pageContext } } : undefined,
    );
  };

  return (
    <Container size="md" h="calc(100vh - 80px)" py="md">
      <Stack h="100%">
        <Group>
          <IconRobot size={24} />
          <Title order={3}>{t("AI Agent")}</Title>
        </Group>

        <Paper
          withBorder
          shadow="xs"
          p="0"
          style={{ flex: 1, overflow: "hidden" }}
        >
          <Stack h="100%" gap={0}>
            <ScrollArea viewportRef={viewport} style={{ flex: 1 }} p="md">
              <Stack gap="md">
                {messages.length === 0 && (
                  <Box py="xl" style={{ textAlign: "center" }}>
                    <Text c="dimmed">
                      {t("Ask me anything about your workspace...")}
                    </Text>
                  </Box>
                )}
                {messages.map((m) => (
                  <Box
                    key={m.id}
                    style={{
                      alignSelf:
                        m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                    }}
                  >
                    <Paper
                      p="sm"
                      radius="md"
                      bg={m.role === "user" ? "blue" : "gray.1"}
                      c={m.role === "user" ? "white" : "black"}
                    >
                      {m.parts.map((part, i) => {
                        if (part.type === "text") {
                          return (
                            <Text
                              key={i}
                              size="sm"
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {part.text}
                            </Text>
                          );
                        }
                        if (isToolUIPart(part)) {
                          const toolName =
                            part.type === "dynamic-tool"
                              ? part.toolName
                              : part.type.replace("tool-", "");
                          return (
                            <Box key={i} mt="xs">
                              <Paper
                                withBorder
                                p="xs"
                                radius="xs"
                                bg="white"
                              >
                                <Text size="xs" fw={700}>
                                  Tool: {toolName}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {part.state === "output-available"
                                    ? "Finished"
                                    : "Running..."}
                                </Text>
                              </Paper>
                            </Box>
                          );
                        }
                        return null;
                      })}
                    </Paper>
                  </Box>
                ))}
              </Stack>
            </ScrollArea>

            <Box
              p="md"
              pos="relative"
              style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}
            >
              <PageMentionDropdown
                query={mentionQuery ?? ""}
                opened={mentionOpened}
                onSelect={handleMentionSelect}
                onClose={() => setMentionQuery(null)}
                spaceId={space?.id}
              />

              {mentionedPages.length > 0 && (
                <Group gap={4} mb="xs">
                  {mentionedPages.map((page) => (
                    <Badge
                      key={page.id}
                      variant="light"
                      rightSection={
                        <CloseButton
                          size="xs"
                          onClick={() => removeMentionedPage(page.id)}
                          style={{ cursor: "pointer" }}
                        />
                      }
                    >
                      {page.icon} {page.title}
                    </Badge>
                  ))}
                </Group>
              )}

              <form onSubmit={handleSend}>
                <Group gap="xs">
                  <TextInput
                    ref={inputRef}
                    placeholder={t(
                      "Type your message... Use @ to mention a page",
                    )}
                    value={localInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    style={{ flex: 1 }}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                  <ActionIcon
                    type="submit"
                    variant="filled"
                    size="lg"
                    loading={isLoading}
                    disabled={
                      !localInput.trim() && mentionedPages.length === 0
                    }
                  >
                    <IconSend size={18} />
                  </ActionIcon>
                </Group>
              </form>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
