import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Text, Paper, ActionIcon, Card, Loader, ScrollArea } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import { IconDownload, IconFileText, IconMaximize } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import { formatBytes } from "@/lib";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import classes from "./word-view.module.css";

export default function WordView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected, editor } = props;
  
  // Safely extract attributes with fallbacks
  const attrs = node?.attrs || {};
  const { url, name, size } = attrs;
  const { hovered, ref } = useHover();
  const [showPreview, setShowPreview] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (url && showPreview && !htmlContent) {
      loadWordDocument();
    }
  }, [url, showPreview]);

  const loadWordDocument = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const fileUrl = getFileUrl(url);
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(t("Failed to load document"));
      }

      const arrayBuffer = await response.arrayBuffer();

      // Dynamically import mammoth for client-side rendering
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer });

      setHtmlContent(result.value);

      if (result.messages.length > 0) {
        console.warn("Mammoth conversion messages:", result.messages);
      }
    } catch (err) {
      console.error("Error loading Word document:", err);
      setError(err instanceof Error ? err.message : t("Failed to load document"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!url) {
    return (
      <NodeViewWrapper>
        <Paper withBorder p="xs">
          <Group gap="sm">
            <Loader size={20} />
            <Text size="md">{t("Loading document...")}</Text>
          </Group>
        </Paper>
      </NodeViewWrapper>
    );
  }

  const fileUrl = getFileUrl(url);

  // In readonly mode or when preview is not expanded, show compact view
  if (!editor.isEditable || !showPreview) {
    return (
      <NodeViewWrapper>
        <Paper withBorder p="4px" ref={ref} data-drag-handle>
          <Group
            justify="space-between"
            gap="xl"
            style={{ cursor: "pointer" }}
            wrap="nowrap"
            h={25}
          >
            <Group wrap="nowrap" gap="sm" style={{ minWidth: 0, flex: 1 }}>
              <IconFileText size={20} style={{ flexShrink: 0 }} color="#2b579a" />

              <Text component="span" size="md" truncate="end" style={{ minWidth: 0 }}>
                {name}
              </Text>

              <Text component="span" size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {formatBytes(size)}
              </Text>
            </Group>

            {(selected || hovered || !editor.isEditable) && (
              <Group gap="xs">
                {editor.isEditable && (
                  <ActionIcon
                    variant="default"
                    aria-label="preview word"
                    onClick={() => setShowPreview(true)}
                  >
                    <IconMaximize size={18} />
                  </ActionIcon>
                )}
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  <ActionIcon variant="default" aria-label="download word">
                    <IconDownload size={18} />
                  </ActionIcon>
                </a>
              </Group>
            )}
          </Group>
        </Paper>
      </NodeViewWrapper>
    );
  }

  // Expanded preview mode with rendered HTML
  return (
    <NodeViewWrapper>
      <Card withBorder padding="xs">
        <Group justify="space-between" mb="xs">
          <Group gap="sm">
            <IconFileText size={20} color="#2b579a" />
            <Text fw={500}>{name}</Text>
            <Text size="sm" c="dimmed">
              {formatBytes(size)}
            </Text>
          </Group>
          <Group gap="xs">
            <ActionIcon
              variant="default"
              aria-label="collapse preview"
              onClick={() => setShowPreview(false)}
            >
              <IconMaximize size={18} />
            </ActionIcon>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              <ActionIcon variant="default" aria-label="download word">
                <IconDownload size={18} />
              </ActionIcon>
            </a>
          </Group>
        </Group>

        {isLoading ? (
          <Group justify="center" py="xl">
            <Loader />
            <Text>{t("Rendering document...")}</Text>
          </Group>
        ) : error ? (
          <Paper bg="red.0" p="md" withBorder>
            <Text c="red.7">{error}</Text>
          </Paper>
        ) : (
          <ScrollArea h={600} offsetScrollbars>
            <div
              className={classes.wordPreviewContent}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </ScrollArea>
        )}
      </Card>
    </NodeViewWrapper>
  );
}
