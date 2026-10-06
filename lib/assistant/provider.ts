import type { RichTextDocument } from "@/lib/rich-text";

export type TextAssistantAction = "draft" | "improve";
export type TextAssistantContext = {
  productTitle?: string;
  productSubtitle?: string;
  productKind?: string;
  category?: string;
  courseTitle?: string;
  lessonTitle?: string;
  membershipTitle?: string;
  postTitle?: string;
};
export type TextAssistantRequest = {
  action: TextAssistantAction;
  currentDocument?: RichTextDocument;
  context: TextAssistantContext;
};

export interface TextAssistantProvider {
  generate(input: TextAssistantRequest): Promise<RichTextDocument>;
}
