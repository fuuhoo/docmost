import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, Text, Paper, ActionIcon, Card, Loader, ScrollArea, AspectRatio, Button } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import { IconDownload, IconPresentation, IconMaximize, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import { formatBytes } from "@/lib";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import classes from "./pptx-view.module.css";

export default function PptxView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected, editor } = props;

  // Safely extract attributes with fallbacks
  const attrs = node?.attrs || {};
  const { url, name, size } = attrs;
  const { hovered, ref } = useHover();
  const [showPreview, setShowPreview] = useState(true);
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (url && showPreview && slides.length === 0) {
      loadPptxDocument();
    }
  }, [url, showPreview]);

  const loadPptxDocument = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const fileUrl = getFileUrl(url);
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(t("Failed to load document"));
      }

      const arrayBuffer = await response.arrayBuffer();

      // Dynamically import JSZip and parse PPTX
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Find all slide files
      const slideFiles = Object.keys(zip.files)
        .filter(path => path.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort();

      const extractedSlides: string[] = [];

      for (const slideFile of slideFiles) {
        const content = await zip.file(slideFile)?.async("text");
        if (content) {
          const html = parseSlideXml(content);
          extractedSlides.push(html);
        }
      }

      setSlides(extractedSlides);
    } catch (err) {
      console.error("Error loading PPTX document:", err);
      setError(err instanceof Error ? err.message : t("Failed to load document"));
    } finally {
      setIsLoading(false);
    }
  };

  // Simple PPTX XML parser to extract text content
  const parseSlideXml = (xml: string): string => {
    // Extract all text from <a:t> tags
    const textMatches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
    const texts = textMatches.map(match => {
      return match.replace(/<[^>]+>/g, ""); // Remove XML tags
    });

    // Group texts into paragraphs (simple heuristic)
    const paragraphs: string[] = [];
    let currentPara = "";

    for (const text of texts) {
      if (text.trim() === "" || text === "\n") {
        if (currentPara.trim()) {
          paragraphs.push(currentPara.trim());
          currentPara = "";
        }
      } else {
        currentPara += text;
      }
    }

    if (currentPara.trim()) {
      paragraphs.push(currentPara.trim());
    }

    // Convert to HTML
    return paragraphs
      .map(para => {
        // Detect headings (short text or all caps)
        if (para.length < 50 && para === para.toUpperCase() && para.length > 3) {
          return `<h2>${escapeHtml(para)}</h2>`;
        }
        return `<p>${escapeHtml(para)}</p>`;
      })
      .join("\n");
  };

  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const goToNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
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
              <IconPresentation size={20} style={{ flexShrink: 0 }} color="#d24726" />

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
                    aria-label="preview pptx"
                    onClick={() => setShowPreview(true)}
                  >
                    <IconMaximize size={18} />
                  </ActionIcon>
                )}
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  <ActionIcon variant="default" aria-label="download pptx">
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

  // Expanded preview mode with parsed slides
  return (
    <NodeViewWrapper>
      <Card withBorder padding="xs">
        <Group justify="space-between" mb="xs">
          <Group gap="sm">
            <IconPresentation size={20} color="#d24726" />
            <Text fw={500}>{name}</Text>
            <Text size="sm" c="dimmed">
              {formatBytes(size)}
            </Text>
            {slides.length > 0 && (
              <Text size="sm" c="dimmed">
                {t("Slide {{current}} of {{total}}", {
                  current: currentSlide + 1,
                  total: slides.length,
                })}
              </Text>
            )}
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
              <ActionIcon variant="default" aria-label="download pptx">
                <IconDownload size={18} />
              </ActionIcon>
            </a>
          </Group>
        </Group>

        {isLoading ? (
          <Group justify="center" py="xl">
            <Loader />
            <Text>{t("Parsing presentation...")}</Text>
          </Group>
        ) : error ? (
          <Paper bg="red.0" p="md" withBorder>
            <Text c="red.7">{error}</Text>
            <Text size="sm" mt="xs" c="dimmed">
              {t("PPTX parsing failed. You can still download the file.")}
            </Text>
          </Paper>
        ) : slides.length === 0 ? (
          <Paper bg="yellow.0" p="md" withBorder>
            <Text c="yellow.7">{t("No slides found in this presentation.")}</Text>
          </Paper>
        ) : (
          <>
            <ScrollArea h={500} offsetScrollbars>
              <div
                className={classes.slideContent}
                dangerouslySetInnerHTML={{ __html: slides[currentSlide] }}
              />
            </ScrollArea>

            {slides.length > 1 && (
              <Group justify="center" mt="md" gap="md">
                <Button
                  variant="default"
                  leftSection={<IconChevronLeft size={16} />}
                  onClick={goToPrevSlide}
                  disabled={currentSlide === 0}
                  size="compact-sm"
                >
                  {t("Previous")}
                </Button>
                <Text size="sm" c="dimmed">
                  {currentSlide + 1} / {slides.length}
                </Text>
                <Button
                  variant="default"
                  rightSection={<IconChevronRight size={16} />}
                  onClick={goToNextSlide}
                  disabled={currentSlide === slides.length - 1}
                  size="compact-sm"
                >
                  {t("Next")}
                </Button>
              </Group>
            )}
          </>
        )}
      </Card>
    </NodeViewWrapper>
  );
}
