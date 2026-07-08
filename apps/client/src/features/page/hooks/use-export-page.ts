import { useState } from "react";
import api from "@/lib/api-client";
import { saveAs } from "file-saver";
import { ExportFormat, IExportPageParams } from "@/features/page/types/page.types";
import { notifications } from "@mantine/notifications";

export function useExportPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const exportPageToFormat = async (params: IExportPageParams): Promise<void> => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      // Map format to endpoint
      let endpoint = "/pages/export";
      if (params.format === ExportFormat.DOCX || params.format === ExportFormat.PDF) {
        endpoint = `/pages/export/${params.format}`;
      }

      const requestData = {
        pageId: params.pageId,
        ...(params.includeChildren !== undefined && { includeChildren: params.includeChildren }),
        ...(params.includeAttachments !== undefined && { includeAttachments: params.includeAttachments }),
      };

      // Only add format for markdown/html endpoints
      if (params.format === ExportFormat.Markdown || params.format === ExportFormat.HTML) {
        (requestData as any).format = params.format;
      }

      const req = await api.post(endpoint, requestData, {
        responseType: "blob",
      });

      const fileName = req?.headers["content-disposition"]
        ?.split("filename=")[1]
        ?.replace(/"/g, "");

      let decodedFileName = fileName;
      try {
        decodedFileName = decodeURIComponent(fileName || "");
      } catch (err) {
        // fallback to raw filename
      }

      if (!decodedFileName) {
        // Generate default filename based on format
        const timestamp = new Date().toISOString().split("T")[0];
        const formatExt = params.format === ExportFormat.DOCX ? "docx" : params.format;
        decodedFileName = `document_${timestamp}.${formatExt}`;
      }

      saveAs(req.data, decodedFileName);
      setExportProgress(100);
    } catch (err: any) {
      notifications.show({
        message: "Export failed: " + (err.response?.data?.message || err.message),
        color: "red",
      });
      console.error("export error", err);
      throw err;
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return {
    isExporting,
    exportProgress,
    exportPageToFormat,
  };
}
