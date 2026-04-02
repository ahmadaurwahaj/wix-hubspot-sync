import { type FC, useEffect, useRef, useState } from 'react';
import {
  Page,
  WixDesignSystemProvider,
  Card,
  Button,
  Box,
  Text,
  Loader,
  Badge,
  EmptyState,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import * as Icons from '@wix/wix-ui-icons-common';
import { dashboard } from '@wix/dashboard';
import { getInstanceId, apiFetch } from '../../lib/api';

interface ConnectionStatus {
  connected: boolean;
  hubspotAccountId?: string;
  connectedAt?: string;
  lastSyncAt?: string;
}

const ConnectionPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const instanceIdRef = useRef<string>('');

  useEffect(() => {
    instanceIdRef.current = getInstanceId();
    fetchConnectionStatus();
  }, []);

  const fetchConnectionStatus = async () => {
    try {
      setLoading(true);
      
     
      const res = await apiFetch(`/api/dashboard/connection?instanceId=${instanceIdRef.current}`);
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setStatus(data);
      setError(null);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[connection] fetchConnectionStatus error:', err);
      setError(`Failed to fetch connection status: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      
     
      const res = await apiFetch('/api/oauth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: instanceIdRef.current }),
      });
      const result = await res.json();
      
      if (result.authUrl) {
        const popup = window.open(result.authUrl, 'hubspot-oauth', 'width=600,height=700');
        
        
        const onMessage = (event: MessageEvent) => {
          try {
           
            const data = typeof event.data === 'object' ? JSON.parse(JSON.stringify(event.data)) : event.data;
            if (data?.type === 'oauth-success') {
              window.removeEventListener('message', onMessage);
              setConnecting(false);
              fetchConnectionStatus();
            } else if (data?.type === 'oauth-error') {
              window.removeEventListener('message', onMessage);
              setError(data.message || 'OAuth failed');
              setConnecting(false);
            }
          } catch (e) {
           
          }
        };
        window.addEventListener('message', onMessage);
        
        
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', onMessage);
            setConnecting(false);
            fetchConnectionStatus();
          }
        }, 1000);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[connection] handleConnect error:', err);
      setError(`Failed to connect to HubSpot: ${msg}`);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect HubSpot?')) {
      return;
    }

    try {
      setLoading(true);
      
      const res = await apiFetch('/api/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: instanceIdRef.current }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to disconnect');
      }
      
      await fetchConnectionStatus();
    } catch (err) {
      setError('Failed to disconnect');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Header title="HubSpot Connection" />
          <Page.Content>
            <Box align="center" verticalAlign="middle" height="400px">
              <Loader size="medium" />
            </Box>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="HubSpot Connection"
          subtitle="Connect your HubSpot account to sync contacts"
        />
        <Page.Content>
          <Box direction="vertical" gap="SP4">
            {error && (
              <Card>
                <Card.Content>
                  <Box gap="SP2" verticalAlign="middle">
                    <Icons.StatusWarning />
                    <Text skin="error">{error}</Text>
                  </Box>
                </Card.Content>
              </Card>
            )}

            {!status?.connected ? (
              <Card>
                <Card.Header
                  title="Connect to HubSpot"
                  suffix={
                    <Badge skin="neutralLight">Not Connected</Badge>
                  }
                />
                <Card.Divider />
                <Card.Content>
                  <Box direction="vertical" gap="SP4">
                    <EmptyState
                      theme="page-no-border"
                      title="Connect Your HubSpot Account"
                      subtitle="Sync contacts between Wix and HubSpot automatically"
                      image={<Icons.App />}
                    >
                      <Box gap="SP2" marginTop="SP4">
                        <Button
                          onClick={handleConnect}
                          prefixIcon={<Icons.Link />}
                          disabled={connecting}
                        >
                          {connecting ? 'Connecting...' : 'Connect HubSpot'}
                        </Button>
                      </Box>
                    </EmptyState>

                    <Box direction="vertical" gap="SP2" marginTop="SP4">
                      <Text size="small" weight="bold">What happens when you connect?</Text>
                      <Box direction="vertical" gap="SP1">
                        <Box gap="SP2">
                          <Icons.CircleSmallFilled size="12px" />
                          <Text size="small">You'll be redirected to HubSpot to authorize access</Text>
                        </Box>
                        <Box gap="SP2">
                          <Icons.CircleSmallFilled size="12px" />
                          <Text size="small">We'll securely store your connection</Text>
                        </Box>
                        <Box gap="SP2">
                          <Icons.CircleSmallFilled size="12px" />
                          <Text size="small">You can configure field mappings and start syncing</Text>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </Card.Content>
              </Card>
            ) : (
              <Card>
                <Card.Header
                  title="HubSpot Connected"
                  suffix={
                    <Badge skin="success">Connected</Badge>
                  }
                />
                <Card.Divider />
                <Card.Content>
                  <Box direction="vertical" gap="SP4">
                    <Box direction="vertical" gap="SP2">
                      <Box gap="SP2" verticalAlign="middle">
                        <Icons.StatusComplete />
                        <Text weight="bold">Connection Active</Text>
                      </Box>
                      <Text size="small" secondary>
                        Your Wix site is connected to HubSpot and ready to sync contacts.
                      </Text>
                    </Box>

                    <Box direction="vertical" gap="SP2">
                      <Text size="small" weight="bold">Connection Details</Text>
                      <Box direction="vertical" gap="SP1">
                        {status.hubspotAccountId && (
                          <Box gap="SP2">
                            <Text size="small" secondary>Account ID:</Text>
                            <Text size="small">{status.hubspotAccountId}</Text>
                          </Box>
                        )}
                        {status.connectedAt && (
                          <Box gap="SP2">
                            <Text size="small" secondary>Connected:</Text>
                            <Text size="small">
                              {new Date(status.connectedAt).toLocaleString()}
                            </Text>
                          </Box>
                        )}
                        {status.lastSyncAt && (
                          <Box gap="SP2">
                            <Text size="small" secondary>Last Sync:</Text>
                            <Text size="small">
                              {new Date(status.lastSyncAt).toLocaleString()}
                            </Text>
                          </Box>
                        )}
                      </Box>
                    </Box>

                    <Box gap="SP2">
                      <Button
                        skin="destructive"
                        priority="secondary"
                        onClick={handleDisconnect}
                        prefixIcon={<Icons.Unlink />}
                      >
                        Disconnect
                      </Button>
                    </Box>
                  </Box>
                </Card.Content>
              </Card>
            )}

            <Card>
              <Card.Header title="Next Steps" />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP2">
                  <Box gap="SP2" verticalAlign="middle">
                    <Text weight="bold">1.</Text>
                    <Text>Configure field mappings to control which data syncs</Text>
                  </Box>
                  <Box gap="SP2" verticalAlign="middle">
                    <Text weight="bold">2.</Text>
                    <Text>View sync status and logs to monitor activity</Text>
                  </Box>
                  <Box gap="SP2" verticalAlign="middle">
                    <Text weight="bold">3.</Text>
                    <Text>Contacts will sync automatically when created or updated</Text>
                  </Box>
                </Box>
              </Card.Content>
            </Card>
          </Box>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default ConnectionPage;
