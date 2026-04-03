import { type FC, useEffect, useState } from "react";
import { dashboard } from "@wix/dashboard";
import {
  Page,
  WixDesignSystemProvider,
  Card,
  Button,
  Box,
  Text,
  Loader,
  Badge,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import * as Icons from "@wix/wix-ui-icons-common";
import { getInstanceId, apiFetch } from "../../lib/api";

interface DashboardData {
  connected: boolean;
  stats?: {
    total: number;
    success: number;
    error: number;
    lastSync?: string;
  };
  mappingsCount?: number;
}

const DashboardPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({ connected: false });

  const instanceId = getInstanceId();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const statusRes = await apiFetch(
        `/api/dashboard/connection?instanceId=${instanceId}`,
      );
      const statusData = await statusRes.json();

      const dashboardData: DashboardData = {
        connected: statusData.connected,
      };

      if (statusData.connected) {
        const syncRes = await apiFetch(
          `/api/dashboard/sync?instanceId=${instanceId}&limit=1`,
        );
        const syncData = await syncRes.json();
        dashboardData.stats = syncData.stats;

        const mappingsRes = await apiFetch(
          `/api/dashboard/mappings?instanceId=${instanceId}`,
        );
        const mappingsData = await mappingsRes.json();
        dashboardData.mappingsCount = mappingsData.mappings?.length || 0;
      }

      setData(dashboardData);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Header title="HubSpot Integration" />
          <Page.Content>
            <Box align="center" verticalAlign="middle" height="400px">
              <Loader size="medium" />
            </Box>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  const successRate =
    data.stats && data.stats.total > 0
      ? Math.round((data.stats.success / data.stats.total) * 100)
      : 0;

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="HubSpot Integration"
          subtitle="Sync contacts between Wix and HubSpot automatically"
        />
        <Page.Content>
          <Box direction="vertical" gap="SP4">
            {/* Connection Status Card */}
            <Card>
              <Card.Header
                title="Connection Status"
                suffix={
                  data.connected ? (
                    <Badge skin="success">Connected</Badge>
                  ) : (
                    <Badge skin="neutralLight">Not Connected</Badge>
                  )
                }
              />
              <Card.Divider />
              <Card.Content>
                {data.connected ? (
                  <Box direction="vertical" gap="SP3">
                    <Box gap="SP2" verticalAlign="middle">
                      <Icons.StatusComplete />
                      <Text>Your HubSpot account is connected and syncing</Text>
                    </Box>
                    {data.stats?.lastSync && (
                      <Box gap="SP2" verticalAlign="middle">
                        <Icons.Time />
                        <Text size="small" secondary>
                          Last sync:{" "}
                          {new Date(data.stats.lastSync).toLocaleString()}
                        </Text>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box direction="vertical" gap="SP3">
                    <Text>
                      Connect your HubSpot account to start syncing contacts
                    </Text>
                    <Box>
                      <Button
                        onClick={() =>
                          dashboard.navigate({
                            pageId: "8f3e9a2b-4c7d-4e1f-9b8a-3d5c6e7f8a9b",
                          })
                        }
                        prefixIcon={<Icons.Link />}
                      >
                        Connect HubSpot
                      </Button>
                    </Box>
                  </Box>
                )}
              </Card.Content>
            </Card>

            <Card>
              <Card.Header title="Quick Actions" />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP3">
                  <Box gap="SP3" verticalAlign="middle">
                    <Box width="40px" align="center">
                      <Icons.Link size="24px" />
                    </Box>
                    <Box direction="vertical" gap="SP1" flexGrow={1}>
                      <Text weight="bold">Connection</Text>
                      <Text size="small" secondary>
                        {data.connected
                          ? "Manage your HubSpot connection"
                          : "Connect your HubSpot account"}
                      </Text>
                    </Box>
                    <Button
                      size="small"
                      priority="secondary"
                      onClick={() =>
                        dashboard.navigate({
                          pageId: "8f3e9a2b-4c7d-4e1f-9b8a-3d5c6e7f8a9b",
                        })
                      }
                    >
                      {data.connected ? "Manage" : "Connect"}
                    </Button>
                  </Box>

                  <Box gap="SP3" verticalAlign="middle">
                    <Box width="40px" align="center">
                      <Icons.Tablet size="24px" />
                    </Box>
                    <Box direction="vertical" gap="SP1" flexGrow={1}>
                      <Text weight="bold">Field Mapping</Text>
                      <Text size="small" secondary>
                        Configure which fields sync between systems
                        {data.mappingsCount !== undefined &&
                          ` (${data.mappingsCount} mappings)`}
                      </Text>
                    </Box>
                    <Button
                      size="small"
                      priority="secondary"
                      onClick={() =>
                        dashboard.navigate({
                          pageId: "2d4e6f8a-9b1c-4d3e-8f7a-5b6c7d8e9f0a",
                        })
                      }
                      disabled={!data.connected}
                    >
                      Configure
                    </Button>
                  </Box>

                  <Box gap="SP3" verticalAlign="middle">
                    <Box width="40px" align="center">
                      <Icons.Refresh size="24px" />
                    </Box>
                    <Box direction="vertical" gap="SP1" flexGrow={1}>
                      <Text weight="bold">Sync Status</Text>
                      <Text size="small" secondary>
                        View sync logs and monitor activity
                      </Text>
                    </Box>
                    <Button
                      size="small"
                      priority="secondary"
                      onClick={() =>
                        dashboard.navigate({
                          pageId: "5a7b9c1d-3e5f-4a7b-9c1d-3e5f7a9b1c3d",
                        })
                      }
                      disabled={!data.connected}
                    >
                      View Logs
                    </Button>
                  </Box>
                </Box>
              </Card.Content>
            </Card>

            {!data.connected && (
              <Card>
                <Card.Header title="Getting Started" />
                <Card.Divider />
                <Card.Content>
                  <Box direction="vertical" gap="SP2">
                    <Box gap="SP2" verticalAlign="middle">
                      <Text weight="bold">1.</Text>
                      <Text>Connect your HubSpot account using OAuth</Text>
                    </Box>
                    <Box gap="SP2" verticalAlign="middle">
                      <Text weight="bold">2.</Text>
                      <Text>Configure field mappings to control data sync</Text>
                    </Box>
                    <Box gap="SP2" verticalAlign="middle">
                      <Text weight="bold">3.</Text>
                      <Text>Contacts will sync automatically in real-time</Text>
                    </Box>
                  </Box>
                </Card.Content>
              </Card>
            )}

            <Card>
              <Card.Header title="Features" />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP2">
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Bi-directional contact sync (Wix ↔ HubSpot)
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Real-time sync with webhook support
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">Configurable field mappings</Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">Conflict resolution strategies</Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Form submission integration with UTM tracking
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Comprehensive sync logs and monitoring
                    </Text>
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

export default DashboardPage;
