import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Button,
  Card,
  Group,
  Image,
  Modal,
  Text,
} from "@mantine/core";
import { useRef, useState, useEffect, useCallback } from "react";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { useDisclosure } from "@mantine/hooks";
import { getFileUrl } from "@/lib/config.ts";
import { IAttachment } from "@/features/attachments/types/attachment.types";
import clsx from "clsx";
import { IconAlertCircle, IconEdit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@mantine/core";  // 加上 ActionIcon
import ReactClearModal from "react-clear-modal";   // 新增这一行

export default function KityminderView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, selected } = props;
  const { src, title, width, attachmentId, jsonSrc } = node.attrs;
  const [opened, { open, close }] = useDisclosure(false);
  const [initialData, setInitialData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveRequestedRef = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = async () => {
    if (!editor.isEditable) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (jsonSrc) {
        const url = getFileUrl(jsonSrc);
        const request = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        if (!request.ok) {
          throw new Error(`Failed to load mindmap data: ${request.status}`);
        }
        const data = await request.json();
        setInitialData(data);
      } else {
        setInitialData(null);
      }
    } catch (err) {
      console.error("Error loading initial data:", err);
    } finally {
      setLoading(true);
      setError(null);
      open();
    }
  };

  // iframe 加载超时保护
  useEffect(() => {
    if (!opened) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      return;
    }

    // 10 秒超时
    loadingTimeoutRef.current = setTimeout(() => {
      if (loading) {
        setError("加载超时，请检查网络后重试");
        setLoading(false);
      }
    }, 10000);

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [opened]);

  const handleIframeMessage = useCallback(
    (event: MessageEvent) => {
      // 校验来源：只接受同源消息
      if (event.origin !== window.location.origin) {
        return;
      }

      const { type, data, message } = event.data || {};

      if (type === "ready") {
        setLoading(false);
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            { type: "loadData", data: initialData },
            "*"
          );
        }
      } else if (type === "saveComplete") {
        handleSaveComplete(data, event.data.svg);
      } else if (type === "error") {
        setError(message);
        setLoading(false);
      }
    },
    [initialData]
  );

  useEffect(() => {
    if (!opened) return;

    window.addEventListener("message", handleIframeMessage);
    return () => {
      window.removeEventListener("message", handleIframeMessage);
    };
  }, [opened, handleIframeMessage]);

  const handleSaveComplete = async (data: any, svg: string | null) => {
    if (!saveRequestedRef.current) return;
    saveRequestedRef.current = false;

    // @ts-ignore
    const pageId = editor.storage?.pageId;
    if (!pageId) {
      setError("保存失败: 无法获取页面 ID");
      return;
    }

    try {
      // 保存 JSON 数据
      const jsonFileName = "mindmap.kityminder.json";
      const jsonBlob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      const jsonFile = new File([jsonBlob], jsonFileName);

      // 保存 SVG 预览
      let svgAttachment: IAttachment | null = null;
      if (svg) {
        const svgFileName = "mindmap.preview.svg";
        const svgBlob = new Blob([svg], { type: "image/svg+xml" });
        const svgFile = new File([svgBlob], svgFileName);
        svgAttachment = await uploadFile(svgFile, pageId);
      }

      let jsonAttachment: IAttachment | null = null;
      if (attachmentId) {
        jsonAttachment = await uploadFile(jsonFile, pageId, attachmentId);
      } else {
        jsonAttachment = await uploadFile(jsonFile, pageId);
      }

      const newSrc = svgAttachment
        ? `/api/files/${svgAttachment.id}/${svgAttachment.fileName}?t=${new Date(svgAttachment.updatedAt).getTime()}`
        : src; // SVG 导出失败时保留原 src

      updateAttributes({
        src: newSrc,
        jsonSrc: `/api/files/${jsonAttachment.id}/${jsonAttachment.fileName}?t=${new Date(jsonAttachment.updatedAt).getTime()}`,
        title: jsonAttachment.fileName,
        size: jsonAttachment.fileSize,
        attachmentId: jsonAttachment.id,
      });

      handleClose();
    } catch (error) {
      console.error("Failed to save kityminder:", error);
      setError(
        `保存失败: ${error instanceof Error ? error.message : "未知错误"}`
      );
    }
  };

  const handleSave = () => {
    if (!iframeRef.current?.contentWindow) return;

    saveRequestedRef.current = true;
    iframeRef.current.contentWindow.postMessage({ type: "save" }, "*");
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
        <div style={{ position: "relative" }}>
          <Image
            onClick={(e) => e.detail === 2 && handleOpen()}
            radius="md"
            fit="contain"
            w={width}
            src={getFileUrl(src)}
            alt={title}
            className={clsx(
              selected ? "ProseMirror-selectednode" : "",
              "alignCenter"
            )}
          />

          {selected && editor.isEditable && (
            <ActionIcon
              onClick={handleOpen}
              variant="default"
              color="gray"
              mx="xs"
              className="print-hide"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
              }}
            >
              <IconEdit size={18} />
            </ActionIcon>
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
            <ActionIcon variant="transparent" color="gray">
              <IconEdit size={18} />
            </ActionIcon>
            <Text component="span" size="lg" c="dimmed">
              {t("Double-click to edit KityMinder mindmap")}
            </Text>
          </div>
        </Card>
      )}
    </NodeViewWrapper>
  );
}
