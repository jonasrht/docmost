import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  CloseButton,
  Container,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import {
  IconArrowUp,
  IconFileDescription,
  IconRobot,
  IconTool,
  IconWand,
  IconWriting,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { queryClient } from "@/main";
import { getPageById } from "@/features/page/services/page-service";
import PageMentionDropdown, {
  MentionedPage,
} from "./page-mention-dropdown";

const SUGGESTIONS = [
  { icon: IconFileDescription, key: "summarize" },
  { icon: IconWriting, key: "create" },
  { icon: IconWand, key: "improve" },
];

function TypingIndicator() {
  return (
    <Group gap={4} px="sm">
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "var(--mantine-color-gray-5)",
            animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </Group>
  );
}

export default function SpaceAgent() {
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const { spaceSlug } = useParams();
  const { data: space } = useSpaceQuery(spaceSlug);
  const [currentUser] = useAtom(currentUserAtom);
  const viewport = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !mentionOpened) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleSuggestionClick = (key: string) => {
    const prompts: Record<string, string> = {
      summarize: t("Summarize the content of a page. Use @ to mention it."),
      create: t("Help me create a new page for..."),
      improve: t("Improve the writing of a page. Use @ to mention it."),
    };
    setLocalInput(prompts[key] || "");
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>

      <Container
        size="md"
        h="calc(100vh - 80px)"
        py="md"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <Group mb="md" gap="sm">
          <ThemeIcon size="lg" variant="light" color="blue" radius="md">
            <IconRobot size={20} />
          </ThemeIcon>
          <div>
            <Title order={4}>{t("AI Agent")}</Title>
            <Text size="xs" c="dimmed">
              {space?.name}
            </Text>
          </div>
        </Group>

        <Box
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: "var(--mantine-radius-lg)",
            border: `1px solid ${isDark ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-2)"}`,
            backgroundColor: isDark
              ? "var(--mantine-color-dark-6)"
              : "var(--mantine-color-gray-0)",
          }}
        >
          <ScrollArea
            viewportRef={viewport}
            style={{ flex: 1 }}
            p={isEmpty ? "xl" : "md"}
          >
            {isEmpty ? (
              <Stack
                align="center"
                justify="center"
                h="100%"
                gap="xl"
                py={40}
              >
                <ThemeIcon size={60} radius="xl" variant="light" color="blue">
                  <IconRobot size={32} />
                </ThemeIcon>

                <Stack align="center" gap="xs">
                  <Text size="lg" fw={600}>
                    {t("How can I help you?")}
                  </Text>
                  <Text size="sm" c="dimmed" ta="center" maw={340}>
                    {t(
                      "Ask me anything about your workspace. Use @ to include page content as context.",
                    )}
                  </Text>
                </Stack>

                <Group gap="sm" mt="sm">
                  {SUGGESTIONS.map(({ icon: Icon, key }) => (
                    <UnstyledButton
                      key={key}
                      onClick={() => handleSuggestionClick(key)}
                      p="sm"
                      style={{
                        borderRadius: "var(--mantine-radius-md)",
                        border: `1px solid ${isDark ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-2)"}`,
                        backgroundColor: isDark
                          ? "var(--mantine-color-dark-5)"
                          : "white",
                        transition: "all 0.15s ease",
                      }}
                      styles={{
                        root: {
                          "&:hover": {
                            borderColor: "var(--mantine-color-blue-4)",
                            backgroundColor: isDark
                              ? "var(--mantine-color-dark-4)"
                              : "var(--mantine-color-blue-0)",
                          },
                        },
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Icon
                          size={16}
                          style={{ color: "var(--mantine-color-blue-6)" }}
                        />
                        <Text size="xs" fw={500}>
                          {t(
                            key === "summarize"
                              ? "Summarize"
                              : key === "create"
                                ? "Create page"
                                : "Improve text",
                          )}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Group>
              </Stack>
            ) : (
              <Stack gap="lg">
                {messages.map((m) => (
                  <Group
                    key={m.id}
                    align="flex-start"
                    gap="sm"
                    wrap="nowrap"
                    style={{
                      justifyContent:
                        m.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    {m.role === "assistant" && (
                      <ThemeIcon
                        size="md"
                        radius="xl"
                        variant="light"
                        color="blue"
                        mt={2}
                      >
                        <IconRobot size={14} />
                      </ThemeIcon>
                    )}

                    <Stack
                      gap={4}
                      style={{
                        maxWidth: "80%",
                        alignItems:
                          m.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <Paper
                        px="sm"
                        py={6}
                        radius="lg"
                        bg={m.role === "user" ? "blue.6" : isDark ? "dark.5" : "white"}
                        c={m.role === "user" ? "white" : undefined}
                        shadow={m.role === "user" ? "none" : "xs"}
                        style={{
                          borderTopRightRadius:
                            m.role === "user" ? 4 : undefined,
                          borderTopLeftRadius:
                            m.role === "assistant" ? 4 : undefined,
                        }}
                      >
                        {m.parts.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <Text
                                key={i}
                                size="sm"
                                style={{
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.55,
                                }}
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
                            const isRunning =
                              part.state !== "output-available";
                            return (
                              <Group
                                key={i}
                                gap="xs"
                                mt={i > 0 ? "xs" : 0}
                              >
                                <ThemeIcon
                                  size="sm"
                                  radius="xl"
                                  variant="light"
                                  color={isRunning ? "blue" : "green"}
                                >
                                  {isRunning ? (
                                    <Loader size={12} color="blue" />
                                  ) : (
                                    <IconTool size={12} />
                                  )}
                                </ThemeIcon>
                                <Text size="xs" c="dimmed">
                                  {toolName}
                                  {isRunning
                                    ? ` \u00b7 ${t("Running...")}`
                                    : ` \u00b7 ${t("Done")}`}
                                </Text>
                              </Group>
                            );
                          }
                          return null;
                        })}
                      </Paper>
                    </Stack>

                    {m.role === "user" && (
                      <Avatar
                        size="sm"
                        radius="xl"
                        src={currentUser?.user?.avatarUrl}
                        color="blue"
                        mt={2}
                      >
                        {currentUser?.user?.name?.[0]?.toUpperCase()}
                      </Avatar>
                    )}
                  </Group>
                ))}

                {isLoading &&
                  messages.length > 0 &&
                  messages[messages.length - 1]?.role === "user" && (
                    <Group align="flex-start" gap="sm">
                      <ThemeIcon
                        size="md"
                        radius="xl"
                        variant="light"
                        color="blue"
                      >
                        <IconRobot size={14} />
                      </ThemeIcon>
                      <Paper
                        px="sm"
                        py={6}
                        radius="lg"
                        bg={isDark ? "dark.5" : "white"}
                        shadow="xs"
                      >
                        <TypingIndicator />
                      </Paper>
                    </Group>
                  )}
              </Stack>
            )}
          </ScrollArea>

          <Box
            px="md"
            py="sm"
            pos="relative"
            style={{
              borderTop: `1px solid ${isDark ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-2)"}`,
              backgroundColor: isDark
                ? "var(--mantine-color-dark-7)"
                : "white",
            }}
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
                    radius="sm"
                    leftSection={page.icon || <IconFileDescription size={12} />}
                    rightSection={
                      <CloseButton
                        size="xs"
                        onClick={() => removeMentionedPage(page.id)}
                        style={{ cursor: "pointer" }}
                      />
                    }
                  >
                    {page.title}
                  </Badge>
                ))}
              </Group>
            )}

            <form onSubmit={handleSend}>
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <Textarea
                  ref={inputRef}
                  placeholder={t(
                    "Type your message... Use @ to mention a page",
                  )}
                  value={localInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  autoComplete="off"
                  autosize
                  minRows={1}
                  maxRows={4}
                  flex={1}
                  variant="unstyled"
                  size="sm"
                  styles={{
                    input: {
                      padding: "8px 0",
                    },
                  }}
                />
                <ActionIcon
                  type="submit"
                  variant="filled"
                  color="blue"
                  size="lg"
                  radius="xl"
                  loading={isLoading}
                  disabled={
                    !localInput.trim() && mentionedPages.length === 0
                  }
                >
                  <IconArrowUp size={18} />
                </ActionIcon>
              </Group>
            </form>
          </Box>
        </Box>
      </Container>
    </>
  );
}
