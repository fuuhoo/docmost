import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Text, Paper, ActionIcon, Loader } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import { IconDownload, IconPaperclip } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import { formatBytes } from "@/lib";
import { useTranslation } from "react-i18next";
import PdfView from "../pdf/pdf-view";
import WordView from "../word/word-view";
import PptxView from "../pptx/pptx-view";

export default function AttachmentView(props: NodeViewProps) {
  const { node } = props;
  
  // Safely extract attributes with fallbacks
  const attrs = node?.attrs || {};
  const { mime, url, name, size } = attrs;

  // Debug log to help identify the issue
  if (!url) {
    console.log("AttachmentView - uploading or missing URL:", { mime, name, size });
  } else {
    console.log("AttachmentView - rendering:", { mime, url, name, size });
  }

  // Check if it's a PDF, Word, or PowerPoint document and render specialized view
  if (mime === "application/pdf") {
    return <PdfView {...props} />;
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    return <WordView {...props} />;
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return <PptxView {...props} />;
  }

  // For other file types, use the simple attachment view
  return <SimpleAttachmentView {...props} />;
}

function SimpleAttachmentView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected } = props;
  const { url, name, size } = node.attrs;
  const { hovered, ref } = useHover();

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
            {url ? (
              <IconPaperclip size={20} style={{ flexShrink: 0 }} />
            ) : (
              <Loader size={20} style={{ flexShrink: 0 }} />
            )}

            <Text component="span" size="md" truncate="end" style={{ minWidth: 0 }}>
              {url ? name : t("Uploading {{name}}", { name })}
            </Text>

            <Text component="span" size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              {formatBytes(size)}
            </Text>
          </Group>

          {url && (selected || hovered) && (
            <a href={getFileUrl(url)} target="_blank">
              <ActionIcon variant="default" aria-label="download file">
                <IconDownload size={18} />
              </ActionIcon>
            </a>
          )}
        </Group>
      </Paper>
    </NodeViewWrapper>
  );
}
