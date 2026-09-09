import "server-only";


export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(params: {
    status: number;
    code: string;
    userMessage: string;
    technicalMessage?: string;
    retryable?: boolean;
  }) {
    super(
      params.technicalMessage ??
      params.userMessage
    );

    this.name = "AppError";

    this.status = params.status;
    this.code = params.code;
    this.userMessage = params.userMessage;
    this.retryable = params.retryable ?? false;
  }
}