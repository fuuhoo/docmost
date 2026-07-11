import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Card,
  Image,
  Modal,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { useRef, useState } from "react";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { useDisclosure } from "@mantine/hooks";
import { getDrawioUrl, getFileUrl } from "@/lib/config.ts";
import {
  DrawIoEmbed,
  DrawIoEmbedRef,
  EventExit,
  EventExport,
  EventSave,
} from "react-drawio";
import { IAttachment } from "@/features/attachments/types/attachment.types";
import { decodeBase64ToSvgString, svgStringToFile } from "@/lib/utils";
import clsx from "clsx";
import { IconEdit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const DRAWIO_XML_ATTR = "data-drawio-xml";

function utf8ToBase64(str: string): string {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    ));
  } catch (e) {
    console.error("Failed to encode string to base64", e);
    return "";
  }
}

function base64ToUtf8(str: string): string {
  try {
    return decodeURIComponent(
      atob(str)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (e) {
    console.error("Failed to decode base64 string", e);
    return "";
  }
}

/**
 * Embed the drawio mxfile XML into the SVG so it can be restored later.
 */
function embedXmlIntoSvg(svgString: string, xml: string): string {
  if (!svgString.startsWith("<svg")) {
    return svgString;
  }

  const encodedXml = utf8ToBase64(xml);
  if (!encodedXml) {
    return svgString;
  }

  // Inject a <desc> element right after the opening <svg> tag
  const svgEndIndex = svgString.indexOf(">", svgString.indexOf("<svg")) + 1;
  if (svgEndIndex <= 0) {
    return svgString;
  }

  const descTag = `<desc ${DRAWIO_XML_ATTR}="${encodedXml}"></desc>`;
  return svgString.slice(0, svgEndIndex) + descTag + svgString.slice(svgEndIndex);
}

/**
 * Extract the previously embedded drawio mxfile XML from the SVG.
 */
function extractXmlFromSvg(svgString: string): string | null {
  if (!svgString.startsWith("<svg")) {
    return null;
  }

  // Try our own embedded attribute first
  const descMatch = svgString.match(
    new RegExp(`<desc ${DRAWIO_XML_ATTR}="([A-Za-z0-9+/=]+)"`, "i")
  );
  if (descMatch) {
    const decoded = base64ToUtf8(descMatch[1]);
    if (decoded) {
      return decoded;
    }
  }

  // Fall back to drawio's native SVG content attribute
  const contentMatch = svgString.match(/<svg[^>]*\scontent="([A-Za-z0-9+/=]+)"/i);
  if (contentMatch) {
    const decoded = base64ToUtf8(contentMatch[1]);
    if (decoded) {
      return decoded;
    }
  }

  return null;
}

export default function DrawioView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, selected } = props;
  const { src, title, width, attachmentId } = node.attrs;
  const drawioRef = useRef<DrawIoEmbedRef>(null);
  const [initialXML, setInitialXML] = useState<string>("");
  const [opened, { open, close }] = useDisclosure(false);
  const computedColorScheme = useComputedColorScheme();
  const pendingXmlRef = useRef<string | null>(null);
  const pendingCloseRef = useRef(false);

  const handleOpen = async () => {
    if (!editor.isEditable) {
      return;
    }

    try {
      if (src) {
        const url = getFileUrl(src);
        const request = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        const svgString = await request.text();
        const mxXml = extractXmlFromSvg(svgString);

        if (mxXml) {
          // drawio expects the raw mxfile XML string
          setInitialXML(mxXml);
        } else {
          // If no XML found, try to load the raw SVG as a fallback.
          // This is not editable but at least shows the diagram.
          const blob = await fetch(url, {
            credentials: "include",
            cache: "no-store",
          }).then((r) => r.blob());

          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            setInitialXML((reader.result || "") as string);
          };
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      open();
    }
  };

  const handleSave = async (data: EventSave) => {
    // If the save is triggered by another event, then do nothing
    if (data.parentEvent !== "save") {
      return;
    }

    // Store the mxfile XML so we can embed it into the exported SVG.
    pendingXmlRef.current = decodeBase64ToSvgString(data.xml);

    // Request an SVG export. The actual save/upload happens in onExport.
    drawioRef.current?.exportDiagram({ format: "xmlsvg" });
  };

  const handleExport = async (data: EventExport) => {
    if (data.format !== "xmlsvg" || !pendingXmlRef.current) {
      return;
    }

    let svgString = data.data || "";

    // The exported data may be a raw base64 string or a data URI
    if (svgString.startsWith("data:image/svg+xml;base64,")) {
      svgString = decodeBase64ToSvgString(svgString);
    } else if (svgString) {
      try {
        svgString = base64ToUtf8(svgString);
      } catch (e) {
        console.error("Failed to decode exported SVG", e);
      }
    }

    if (!svgString.startsWith("<svg")) {
      console.error("Exported data is not a valid SVG");
      pendingXmlRef.current = null;
      return;
    }

    // Embed the mxfile XML into the SVG for later editing.
    svgString = embedXmlIntoSvg(svgString, pendingXmlRef.current);
    pendingXmlRef.current = null;

    const fileName = "diagram.drawio.svg";
    const drawioSVGFile = await svgStringToFile(svgString, fileName);

    // @ts-ignore
    const pageId = editor.storage?.pageId;

    let attachment: IAttachment = null;

    if (attachmentId) {
      attachment = await uploadFile(drawioSVGFile, pageId, attachmentId);
    } else {
      attachment = await uploadFile(drawioSVGFile, pageId);
    }

    updateAttributes({
      src: `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`,
      title: attachment.fileName,
      size: attachment.fileSize,
      attachmentId: attachment.id,
    });

    if (pendingCloseRef.current) {
      close();
    }
  };

  const handleClose = (data: EventExit) => {
    // If the exit is triggered by another event, then do nothing
    if (data.parentEvent) {
      return;
    }

    // If there is a pending export/save, let onExport finish first.
    if (pendingXmlRef.current) {
      pendingCloseRef.current = true;
      return;
    }

    close();
  };

  return (
    <NodeViewWrapper data-drag-handle>
      <Modal.Root opened={opened} onClose={close} fullScreen>
        <Modal.Overlay />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Body>
            <div style={{ height: "100vh" }}>
              <DrawIoEmbed
                ref={drawioRef}
                xml={initialXML}
                baseUrl={getDrawioUrl()}
                urlParameters={{
                  ui: computedColorScheme === "light" ? "kennedy" : "dark",
                  spin: true,
                  libraries: true,
                  saveAndExit: true,
                  noSaveBtn: true,
                }}
                onSave={(data: EventSave) => {
                  handleSave(data);
                }}
                onExport={(data: EventExport) => {
                  handleExport(data);
                }}
                onClose={(data: EventExit) => {
                  handleClose(data);
                }}
              />
            </div>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

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
              "alignCenter",
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
              {t("Double-click to edit Draw.io diagram")}
            </Text>
          </div>
        </Card>
      )}
    </NodeViewWrapper>
  );
}
