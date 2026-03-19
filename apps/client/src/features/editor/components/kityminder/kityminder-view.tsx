import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Button,
  Card,
  Group,
  Image,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { useRef, useState, useEffect } from "react";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { useDisclosure } from "@mantine/hooks";
import { getFileUrl } from "@/lib/config.ts";
import { IAttachment } from "@/features/attachments/types/attachment.types";
import clsx from "clsx";
import { IconEdit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ReactClearModal from "react-clear-modal";

export default function KityminderView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, selected } = props;
  const { src, title, width, attachmentId, jsonSrc } = node.attrs;
  const [opened, { open, close }] = useDisclosure(false);
  const [initialData, setInitialData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const computedColorScheme = useComputedColorScheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveRequestedRef = useRef(false);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const handleOpen = async () => {
    if (!editor.isEditable) {
      return;
    }

    try {
      if (jsonSrc) {
        const url = getFileUrl(jsonSrc);
        const request = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await request.json();
        setInitialData(data);
      }
    } catch (err) {
      console.error("Error loading initial data:", err);
    } finally {
      setLoading(true);
      setError(null);
      open();
    }
  };

  useEffect(() => {
    if (!opened) return;

    const handleMessage = (event: MessageEvent) => {
      const { type, data, message } = event.data || {};

      if (type === 'ready') {
        setLoading(false);
        if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'loadData',
            data: initialData
          }, '*');
        }
      } else if (type === 'saveComplete') {
        handleSaveComplete(data, event.data.svg);
      } else if (type === 'error') {
        setError(message);
        setLoading(false);
      }
    };

    messageHandlerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);

    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
      }
    };
  }, [opened, initialData]);

  const handleSaveComplete = async (data: any, svg: string) => {
    if (!saveRequestedRef.current) return;
    saveRequestedRef.current = false;

    try {
      // 保存 JSON 数据
      const jsonFileName = "mindmap.kityminder.json";
      const jsonBlob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const jsonFile = new File([jsonBlob], jsonFileName);

      // 保存 SVG 预览
      let svgAttachment: IAttachment = null;
      if (svg) {
        const svgFileName = "mindmap.preview.svg";
        const svgBlob = new Blob([svg], { type: "image/svg+xml" });
        const svgFile = new File([svgBlob], svgFileName);
        
        //@ts-ignore
        const pageId = editor.storage?.pageId;
        svgAttachment = await uploadFile(svgFile, pageId);
      }

      //@ts-ignore
      const pageId = editor.storage?.pageId;

      let jsonAttachment: IAttachment = null;

      if (attachmentId) {
        jsonAttachment = await uploadFile(jsonFile, pageId, attachmentId);
      } else {
        jsonAttachment = await uploadFile(jsonFile, pageId);
      }

      updateAttributes({
        src: svgAttachment ? `/api/files/${svgAttachment.id}/${svgAttachment.fileName}?t=${new Date(svgAttachment.updatedAt).getTime()}` : null,
        jsonSrc: `/api/files/${jsonAttachment.id}/${jsonAttachment.fileName}?t=${new Date(jsonAttachment.updatedAt).getTime()}`,
        title: jsonAttachment.fileName,
        size: jsonAttachment.fileSize,
        attachmentId: jsonAttachment.id,
      });

      close();
    } catch (error) {
      console.error("Failed to save kityminder:", error);
      setError(`保存失败: ${error.message}`);
    }
  };

  const handleSave = () => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    
    saveRequestedRef.current = true;
    iframeRef.current.contentWindow.postMessage({
      type: 'save'
    }, '*');
  };

  const handleClose = () => {
    setError(null);
    setLoading(true);
    saveRequestedRef.current = false;
    close();
  };

  return (
    <NodeViewWrapper data-drag-handle>
      <ReactClearModal
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          padding: 0,
          zIndex: 200,
        }}
        isOpen={opened}
        onRequestClose={handleClose}
        disableCloseOnBgClick={true}
        contentProps={{
          style: {
            padding: 0,
            width: "90vw",
          },
        }}
      >
        <Group
          justify="flex-end"
          wrap="nowrap"
          bg="var(--mantine-color-body)"
          p="xs"
        >
          <Button onClick={handleSave} size={"compact-sm"}>
            {t("Save & Exit")}
          </Button>
          <Button onClick={handleClose} color="red" size={"compact-sm"}>
            {t("Exit")}
          </Button>
        </Group>
        <div style={{ position: "relative", height: "90vh" }}>
          {loading && (
            <div style={{ 
              position: "absolute", 
              top: "50%", 
              left: "50%", 
              transform: "translate(-50%, -50%)",
              fontSize: "16px",
              zIndex: 10,
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
            }}>
              正在加载 KityMinder...
            </div>
          )}
          {error && (
            <div style={{ 
              position: "absolute", 
              top: "50%", 
              left: "50%", 
              transform: "translate(-50%, -50%)",
              color: "red",
              fontSize: "16px",
              zIndex: 10,
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
            }}>
              {error}
            </div>
          )}
          <iframe
            ref={iframeRef}
            src="/kityminder/index.html"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
            title="KityMinder Editor"
          />
        </div>
      </ReactClearModal>

      {src ? (
        <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
          {src.endsWith('.json') ? (
            <Card
              radius="md"
              onClick={(e) => e.detail === 2 && handleOpen()}
              p="xs"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "200px",
                width: "100%",
              }}
              withBorder
              className={clsx(selected ? "ProseMirror-selectednode" : "")}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <IconEdit size={18} style={{ marginRight: 8, opacity: 0.5 }} />
                <Text component="span" size="lg" c="dimmed">
                  {title || t("KityMinder mindmap")}
                </Text>
              </div>
            </Card>
          ) : (
            <div style={{ maxWidth: "100%", display: "inline-block" }}>
              <Image
                onClick={(e) => e.detail === 2 && handleOpen()}
                radius="md"
                fit="contain"
                src={getFileUrl(src)}
                alt={title}
                className={clsx(
                  selected ? "ProseMirror-selectednode" : "",
                )}
              />
            </div>
          )}

          {selected && editor.isEditable && (
            <Button
              onClick={handleOpen}
              variant="default"
              color="gray"
              size="compact-sm"
              className="print-hide"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
              }}
            >
              <IconEdit size={16} style={{ marginRight: 4 }} />
              {t("Edit")}
            </Button>
          )}
        </div>
      ) : (
        <Card
          radius="md"
          onClick={(e) => e.detail === 2 && handleOpen()}
          p="xs"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          withBorder
          className={clsx(selected ? "ProseMirror-selectednode" : "")}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <IconEdit size={18} style={{ marginRight: 8, opacity: 0.5 }} />

            <Text component="span" size="lg" c="dimmed">
              {t("Double-click to edit KityMinder mindmap")}
            </Text>
          </div>
        </Card>
      )}
    </NodeViewWrapper>
  );
}