import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface KityminderOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface KityminderAttributes {
  src?: string;
  title?: string;
  size?: number;
  width?: string;
  align?: string;
  attachmentId?: string;
  jsonSrc?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kityminder: {
      setKityminder: (attributes?: KityminderAttributes) => ReturnType;
    };
  }
}

export const Kityminder = Node.create<KityminderOptions>({
  name: "kityminder",
  inline: false,
  group: "block",
  isolating: true,
  atom: true,
  defining: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) => ({
          "data-src": attributes.src,
        }),
      },
      title: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes: KityminderAttributes) => ({
          "data-title": attributes.title,
        }),
      },
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width"),
        renderHTML: (attributes: KityminderAttributes) => ({
          "data-width": attributes.width,
        }),
      },
      size: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-size"),
        renderHTML: (attributes: KityminderAttributes) => ({
          "data-size": attributes.size,
        }),
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align"),
        renderHTML: (attributes: KityminderAttributes) => ({
          "data-align": attributes.align,
        }),
      },
      attachmentId: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes: KityminderAttributes) => ({
          "data-attachment-id": attributes.attachmentId,
        }),
      },
      jsonSrc: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-json-src"),
        renderHTML: (attributes: KityminderAttributes) => ({
          "data-json-src": attributes.jsonSrc,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        "img",
        {
          src: HTMLAttributes["data-src"],
          alt: HTMLAttributes["data-title"],
          width: HTMLAttributes["data-width"],
        },
      ],
    ];
  },

  addCommands() {
    return {
      setKityminder:
        (attrs: KityminderAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "kityminder",
            attrs: attrs,
          });
        },
    };
  },

  addNodeView() {
    this.editor.isInitialized = true;

    return ReactNodeViewRenderer(this.options.view);
  },
});