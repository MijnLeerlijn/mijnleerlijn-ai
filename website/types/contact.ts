// Canoniek datamodel — zie docs/DATA-MODEL.md §ContactSubmission/§Attachment en
// docs/SECURITY-AND-PRIVACY.md.

export type ContactSubmissionStatus = "nieuw" | "in_behandeling" | "afgehandeld";

export interface ContactSubmission {
  id: string;
  teacherName: string;
  schoolName: string;
  email: string;
  requestType: string;
  subject: string;
  problemDescription: string;
  expected: string;
  actual: string;
  pageUrl?: string;
  variantId: string;
  helpCenterUrl: string;
  submittedAt: string;
  /** Alleen een grove categorie (bv. "Chrome op desktop") — nooit fingerprinting. */
  deviceInfo?: string;
  status: ContactSubmissionStatus;
}

export interface Attachment {
  id: string;
  contactSubmissionId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}
