import { useState } from 'react';
import {
  Modal,
  Button,
  FileInput,
  TextInput,
  Group,
  Text,
  Alert,
  Select,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { IconAlertCircle, IconUpload } from '@tabler/icons-react';
import { createPageFromDocument, getSidebarPages } from '../services/page-service';
import { IPage } from '../types/page.types';

interface ImportDocumentModalProps {
  opened: boolean;
  onClose: () => void;
  spaceId?: string;
  parentPageId?: string | null;
  onSuccess?: (pageId: string, slugId: string) => void;
}

export function ImportDocumentModal({
  opened,
  onClose,
  spaceId,
  parentPageId,
  onSuccess,
}: ImportDocumentModalProps) {
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm({
    initialValues: {
      file: null as File | null,
      title: '',
      parentPageId: parentPageId || '',
    },
    validate: {
      file: (value) => (!value ? '请选择一个文件' : null),
    },
  });

  // 获取空间中的页面列表用于父页面选择
  const { data: pagesData } = useQuery({
    queryKey: ['sidebar-pages', spaceId],
    queryFn: () => getSidebarPages({ spaceId }),
    enabled: !!spaceId && opened,
  });

  // 构建页面选项（只显示顶级页面）
  const pageOptions = [
    { value: '', label: '无（创建为顶级页面）' },
    ...(pagesData?.items || [])
      .filter((page: IPage) => !page.parentPageId)
      .map((page: IPage) => ({
        value: page.id,
        label: page.title || 'Untitled',
      })),
  ];

  const mutation = useMutation({
    mutationFn: createPageFromDocument,
    onSuccess: (data) => {
      notifications.show({
        message: `页面 "${data.title}" 创建成功`,
        color: 'green',
      });
      onSuccess?.(data.pageId, data.slugId);
      handleClose();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || '上传失败，请重试';
      notifications.show({
        message,
        color: 'red',
      });
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    if (!values.file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', values.file);
    if (spaceId) formData.append('spaceId', spaceId);
    if (values.title) formData.append('title', values.title);
    if (values.parentPageId) formData.append('parentPageId', values.parentPageId);

    mutation.mutate(formData);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="从文档创建页面"
      size="lg"
      centered
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Alert icon={<IconAlertCircle size={16} />} color="blue" mb="md">
          <Text size="sm">
            支持 PDF、Word (.docx)、PowerPoint (.pptx) 和 Markdown (.md) 文件。上传后将在页面中直接预览原始文档。
          </Text>
        </Alert>

        <FileInput
          label="选择文档"
          placeholder="点击或拖拽文件到这里"
          accept=".pdf,.docx,.pptx,.ppt,.md,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-word,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
          required
          leftSection={<IconUpload size={16} />}
          {...form.getInputProps('file')}
        />

        <TextInput
          label="页面标题（可选）"
          placeholder="留空则使用文件名"
          mt="md"
          {...form.getInputProps('title')}
        />

        <Select
          label="父页面（可选）"
          placeholder="选择父页面，留空则创建为顶级页面"
          data={pageOptions}
          mt="md"
          searchable
          clearable
          {...form.getInputProps('parentPageId')}
        />

        <Group justify="flex-end" mt="xl">
          <Button variant="default" onClick={handleClose} disabled={isUploading}>
            取消
          </Button>
          <Button type="submit" loading={isUploading}>
            {isUploading ? '上传中...' : '创建页面'}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
