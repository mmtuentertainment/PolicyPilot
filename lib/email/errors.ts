export class ResendConfigError extends Error {
  public readonly code = 'RESEND_CONFIG_ERROR' as const;

  constructor(public readonly envVar: string) {
    super(`${envVar} is not configured`);
    this.name = 'ResendConfigError';
  }
}

export class ResendSendError extends Error {
  public readonly code = 'RESEND_SEND_ERROR' as const;

  constructor(
    public readonly type: string,
    public readonly recipientMasked: string,
    public override readonly cause?: unknown,
  ) {
    super(`Resend failed to send ${type} notification to ${recipientMasked}`);
    this.name = 'ResendSendError';
  }
}
