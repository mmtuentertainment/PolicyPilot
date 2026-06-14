import { Button, Heading, Text } from 'react-email';
import { BaseLayout } from './base-layout';

export function ReviewDueEmail({
  policyTitle,
  orgName,
  reviewUrl,
}: {
  policyTitle: string;
  orgName: string;
  reviewUrl: string;
}) {
  return (
    <BaseLayout preview={`Policy review due: ${policyTitle}`}>
      <Heading style={{ color: '#111827', fontSize: '22px' }}>Policy Review Due</Heading>
      <Text style={{ color: '#374151', fontSize: '14px', lineHeight: '22px' }}>
        {orgName} has a policy due for review soon: <strong>{policyTitle}</strong>.
      </Text>
      <Button
        href={reviewUrl}
        style={{
          backgroundColor: '#111827',
          borderRadius: '6px',
          color: '#ffffff',
          fontSize: '14px',
          padding: '10px 16px',
        }}
      >
        Review Policy
      </Button>
    </BaseLayout>
  );
}
