import type { ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from 'react-email';

export function BaseLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            margin: '32px auto',
            maxWidth: '600px',
            padding: '24px',
          }}
        >
          {children}
          <Hr style={{ borderColor: '#e5e7eb', marginTop: '24px' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px' }}>PolicyPilot</Text>
        </Container>
      </Body>
    </Html>
  );
}
