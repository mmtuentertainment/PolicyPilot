import { Button, Heading, Text } from 'react-email';
import { BaseLayout } from './base-layout';

export function PolicyUpdatedEmail({
  policyTitle,
  orgName,
  acknowledgeUrl,
}: {
  policyTitle: string;
  orgName: string;
  acknowledgeUrl: string;
}) {
  return (
    <BaseLayout preview={`Policy updated: ${policyTitle}`}>
      <Heading style={{ color: '#111827', fontSize: '22px' }}>Policy Updated</Heading>
      <Text style={{ color: '#374151', fontSize: '14px', lineHeight: '22px' }}>
        {orgName} updated <strong>{policyTitle}</strong>. Please review the latest version.
      </Text>
      <Button
        href={acknowledgeUrl}
        style={{
          backgroundColor: '#111827',
          borderRadius: '6px',
          color: '#ffffff',
          fontSize: '14px',
          padding: '10px 16px',
        }}
      >
        Review Updated Policy
      </Button>
    </BaseLayout>
  );
}
