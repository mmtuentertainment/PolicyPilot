import { Button, Heading, Text } from 'react-email';
import { BaseLayout } from './base-layout';

export function PolicyAssignedEmail({
  policyTitle,
  orgName,
  acknowledgeUrl,
}: {
  policyTitle: string;
  orgName: string;
  acknowledgeUrl: string;
}) {
  return (
    <BaseLayout preview={`New policy assigned: ${policyTitle}`}>
      <Heading style={{ color: '#111827', fontSize: '22px' }}>Policy Assigned</Heading>
      <Text style={{ color: '#374151', fontSize: '14px', lineHeight: '22px' }}>
        {orgName} assigned you a new policy: <strong>{policyTitle}</strong>.
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
        Review &amp; Acknowledge
      </Button>
    </BaseLayout>
  );
}
