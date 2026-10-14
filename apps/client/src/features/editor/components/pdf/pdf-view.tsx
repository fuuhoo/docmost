import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Text, Paper, ActionIcon, Card, Loader } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import { IconDownload, IconFileDescription, IconMaximize } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import { formatBytes } from "@/lib";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export default function PdfView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected, editor } = props;
  
  // Safely extract attributes with fallbacks
  const attrs = node?.attrs || {};
  const { url, name, size } = attrs;
  const { hovered, ref } = useHover();
  const [showPreview, setShowPreview] = useState(true); // 默认展开预览

  // Handle missing URL (uploading state)
  if (!url) {
    return (
      <NodeViewWrapper>
        <Paper withBorder p="xs">
          <Group gap="sm">
            <Loader size={20} />
            <Text size="md">{t("Loading PDF...")}</Text>
          </Group>
        </Paper>
      </NodeViewWrapper>
    );
  }

  try {
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
                <IconFileDescription size={20} style={{ flexShrink: 0 }} color="#e74c3c" />

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
                      aria-label="preview pdf"
                      onClick={() => setShowPreview(true)}
                    >
                      <IconMaximize size={18} />
                    </ActionIcon>
                  )}
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    <ActionIcon variant="default" aria-label="download pdf">
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

    // Expanded preview mode with iframe
    return (
      <NodeViewWrapper>
        <Card withBorder padding="xs">
          <Group justify="space-between" mb="xs">
            <Group gap="sm">
              <IconFileDescription size={20} color="#e74c3c" />
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
                <ActionIcon variant="default" aria-label="download pdf">
                  <IconDownload size={18} />
                </ActionIcon>
              </a>
            </Group>
          </Group>
          <div style={{ position: "relative", width: "100%", height: "600px" }}>
            <iframe
              src={fileUrl}
              style={{
                width: "100%",
                height: "100%",
                border: "1px solid var(--mantine-color-gray-3)",
                borderRadius: "var(--mantine-radius-sm)",
              }}
              title={name}
            />
          </div>
        </Card>
      </NodeViewWrapper>
    );
  } catch (error) {
    console.error("Error rendering PDF:", error);
    return (
      <NodeViewWrapper>
        <Paper withBorder p="xs" bg="red.0">
          <Group gap="sm">
            <Text c="red.7">{t("Failed to render PDF preview")}</Text>
          </Group>
        </Paper>
      </NodeViewWrapper>
    );
  }
}
