import {
  ActionIcon,
  Box,
  Group,
  Paper,
  ScrollArea,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useSearchSuggestionsQuery } from "@/features/search/queries/search-query";
import { IconFileDescription } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface MentionedPage {
  id: string;
  title: string;
  slugId: string;
  icon: string | null;
}

interface PageMentionDropdownProps {
  query: string;
  opened: boolean;
  onSelect: (page: MentionedPage) => void;
  onClose: () => void;
  spaceId?: string;
}

export default function PageMentionDropdown({
  query,
  opened,
  onSelect,
  onClose,
  spaceId,
}: PageMentionDropdownProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const { data: suggestion, isLoading } = useSearchSuggestionsQuery({
    query,
    includeUsers: false,
    includePages: true,
    spaceId,
    limit: 10,
    preload: opened,
  });

  const pages = suggestion?.pages ?? [];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, pages.length]);

  useEffect(() => {
    if (!opened) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, pages.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const page = pages[selectedIndex];
        if (page) {
          onSelect({
            id: page.id,
            title: page.title || t("Untitled"),
            slugId: page.slugId,
            icon: page.icon,
          });
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [opened, pages, selectedIndex, onSelect, onClose, t]);

  useEffect(() => {
    viewportRef.current
      ?.querySelector(`[data-mention-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!opened) return null;

  return (
    <Box
      pos="absolute"
      bottom="100%"
      left={0}
      right={0}
      mb={4}
      style={{ zIndex: 100 }}
    >
      <Paper shadow="md" withBorder radius="md" w="100%" maw={360} mx="auto">
        <ScrollArea.Autosize
          viewportRef={viewportRef}
          mah={280}
          scrollbars="y"
          scrollbarSize={6}
        >
          {isLoading && pages.length === 0 && (
            <Text c="dimmed" size="sm" p="sm">
              {t("Searching...")}
            </Text>
          )}

          {!isLoading && pages.length === 0 && query.length > 0 && (
            <Text c="dimmed" size="sm" p="sm">
              {t("No pages found")}
            </Text>
          )}

          {!isLoading && pages.length === 0 && query.length === 0 && (
            <Text c="dimmed" size="sm" p="sm">
              {t("Type to search pages...")}
            </Text>
          )}

          {pages.map((page, index) => (
            <UnstyledButton
              key={page.id}
              data-mention-index={index}
              onClick={() =>
                onSelect({
                  id: page.id,
                  title: page.title || t("Untitled"),
                  slugId: page.slugId,
                  icon: page.icon,
                })
              }
              onMouseEnter={() => setSelectedIndex(index)}
              w="100%"
              px="sm"
              py={6}
              style={{
                backgroundColor:
                  index === selectedIndex
                    ? "var(--mantine-color-blue-light)"
                    : undefined,
              }}
            >
              <Group gap="sm" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  component="div"
                  color="gray"
                  size="sm"
                >
                  {page.icon || (
                    <IconFileDescription size={18} stroke={1.5} />
                  )}
                </ActionIcon>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {page.title || t("Untitled")}
                  </Text>
                  {page.space?.name && (
                    <Text size="xs" c="dimmed" truncate>
                      {page.space.name}
                    </Text>
                  )}
                </div>
              </Group>
            </UnstyledButton>
          ))}
        </ScrollArea.Autosize>
      </Paper>
    </Box>
  );
}
