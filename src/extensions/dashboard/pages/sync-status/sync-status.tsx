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
  Table,
  Badge,
  EmptyState,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import * as Icons from "@wix/wix-ui-icons-common";
import { getInstanceId, apiFetch } from "../../lib/api";

interface SyncLog {
  _id: string;
  source: "wix" | "hubspot" | "wix_form";
  action: "create" | "update" | "delete";
  status: "success" | "error" | "skipped";
  wixContactId?: string;
  hubspotContactId?: string;
  error?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface SyncStats {
  total: number;
  success: number;
  error: number;
  skipped: number;
  lastSync?: string;
}

const SyncStatusPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const instanceId = getInstanceId();

  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const statusRes = await apiFetch(
        `/api/dashboard/connection?instanceId=${instanceId}`,
      );
      const statusData = await statusRes.json();
      setConnected(statusData.connected);

      if (!statusData.connected) {
        setLoading(false);
        return;
      }

      const logsRes = await apiFetch(
        `/api/dashboard/sync?instanceId=${instanceId}&limit=50`,
      );
      const logsData = await logsRes.json();

      setLogs(logsData.logs || []);
      setStats(logsData.stats || { total: 0, success: 0, error: 0 });
      setError(null);
    } catch (err) {
      setError("Failed to load sync status");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);

      const res = await apiFetch("/api/dashboard/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });

      if (!res.ok) {
        throw new Error("Failed to trigger sync");
      }

      alert("Sync started! Check back in a few moments.");
      setTimeout(fetchData, 3000);
    } catch (err) {
      setError("Failed to trigger sync");
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge skin="success">Success</Badge>;
      case "error":
        return <Badge skin="danger">Error</Badge>;
      case "skipped":
        return <Badge skin="neutralLight">Skipped</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getSourceIcon = (source: string) => {
    return source === "wix" ? (
      <Icons.StatusComplete />
    ) : (
      <Icons.StatusComplete />
    );
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "wix":
        return "Wix";
      case "wix_form":
        return "Wix Form";
      case "hubspot":
        return "HubSpot";
      default:
        return source;
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case "create":
        return "Created";
      case "update":
        return "Updated";
      case "delete":
        return "Deleted";
      default:
        return action;
    }
  };

  if (loading && !stats) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Header title="Sync Status" />
          <Page.Content>
            <Box align="center" verticalAlign="middle" height="400px">
              <Loader size="medium" />
            </Box>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  if (!connected) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Header title="Sync Status" />
          <Page.Content>
            <EmptyState
              theme="page"
              title="Connect HubSpot First"
              subtitle="You need to connect your HubSpot account to view sync status"
              image={<Icons.Link />}
            >
              <Button
                onClick={() =>
                  dashboard.navigate({
                    pageId: "8f3e9a2b-4c7d-4e1f-9b8a-3d5c6e7f8a9b",
                  })
                }
              >
                Go to Connection
              </Button>
            </EmptyState>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  const successRate =
    stats && stats.success + stats.error > 0
      ? Math.round((stats.success / (stats.success + stats.error)) * 100)
      : stats && stats.success > 0
        ? 100
        : 0;

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="Sync Status"
          subtitle="Monitor contact synchronization between Wix and HubSpot"
          actionsBar={
            <Box gap="SP2">
              <Button
                size="small"
                priority="secondary"
                onClick={fetchData}
                prefixIcon={<Icons.Refresh />}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                size="small"
                onClick={handleManualSync}
                disabled={syncing}
                prefixIcon={<Icons.Refresh />}
              >
                {syncing ? "Syncing..." : "Manual Sync"}
              </Button>
            </Box>
          }
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

            <Box gap="SP4">
              <Box direction="vertical" gap="SP1" width="20%">
                <Text size="small" secondary>
                  Total Syncs
                </Text>
                <Text size="medium" weight="bold">
                  {stats?.total || 0}
                </Text>
              </Box>
              <Box direction="vertical" gap="SP1" width="20%">
                <Text size="small" secondary>
                  Successful
                </Text>
                <Text size="medium" weight="bold" skin="success">
                  {stats?.success || 0}
                </Text>
              </Box>
              <Box direction="vertical" gap="SP1" width="20%">
                <Text size="small" secondary>
                  Skipped
                </Text>
                <Text size="medium" weight="bold" skin="premium">
                  {stats?.skipped || 0}
                </Text>
              </Box>
              <Box direction="vertical" gap="SP1" width="20%">
                <Text size="small" secondary>
                  Errors
                </Text>
                <Text size="medium" weight="bold" skin="error">
                  {stats?.error || 0}
                </Text>
              </Box>
              <Box direction="vertical" gap="SP1" width="20%">
                <Text size="small" secondary>
                  Success Rate
                </Text>
                <Text size="medium" weight="bold">
                  {successRate}%
                </Text>
              </Box>
            </Box>

            {stats?.lastSync && (
              <Card>
                <Card.Content>
                  <Box gap="SP2" verticalAlign="middle">
                    <Icons.Time />
                    <Text size="small">
                      Last sync: {new Date(stats.lastSync).toLocaleString()}
                    </Text>
                  </Box>
                </Card.Content>
              </Card>
            )}

            {/* Sync Logs */}
            <Card>
              <Card.Header
                title="Recent Sync Activity"
                subtitle="Last 50 sync operations"
              />
              <Card.Divider />
              <Card.Content>
                {logs.length === 0 ? (
                  <EmptyState
                    theme="page-no-border"
                    title="No Sync Activity Yet"
                    subtitle="Sync activity will appear here once contacts start syncing"
                    image={<Icons.StatusComplete />}
                  />
                ) : (
                  <Table
                    data={logs}
                    columns={[
                      {
                        title: "Time",
                        width: "180px",
                        render: (row: SyncLog) => (
                          <Text size="small">
                            {new Date(row.timestamp).toLocaleString()}
                          </Text>
                        ),
                      },
                      {
                        title: "Source",
                        width: "100px",
                        render: (row: SyncLog) => (
                          <Box gap="SP1" verticalAlign="middle">
                            {getSourceIcon(row.source)}
                            <Text size="small" weight="bold">
                              {getSourceLabel(row.source)}
                            </Text>
                          </Box>
                        ),
                      },
                      {
                        title: "Action",
                        width: "100px",
                        render: (row: SyncLog) => (
                          <Text size="small">{getActionText(row.action)}</Text>
                        ),
                      },
                      {
                        title: "Status",
                        width: "100px",
                        render: (row: SyncLog) => getStatusBadge(row.status),
                      },
                      {
                        title: "Contact IDs",
                        render: (row: SyncLog) => (
                          <Box direction="vertical" gap="SP1">
                            {row.wixContactId && (
                              <Text size="tiny" secondary>
                                Wix: {row.wixContactId.substring(0, 12)}...
                              </Text>
                            )}
                            {row.hubspotContactId && (
                              <Text size="tiny" secondary>
                                HubSpot: {row.hubspotContactId}
                              </Text>
                            )}
                          </Box>
                        ),
                      },
                      {
                        title: "Details",
                        render: (row: SyncLog) =>
                          row.error ? (
                            <Box gap="SP1" verticalAlign="middle">
                              <Icons.StatusWarning size="18px" />
                              <Text size="small" skin="error">
                                {row.error.substring(0, 50)}
                                {row.error.length > 50 ? "..." : ""}
                              </Text>
                            </Box>
                          ) : (
                            <Text size="small" secondary>
                              —
                            </Text>
                          ),
                      },
                    ]}
                  >
                    <Table.Content />
                  </Table>
                )}
              </Card.Content>
            </Card>

            <Card>
              <Card.Header title="How Sync Works" />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP2">
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Contacts sync automatically when created or updated
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Sync happens in real-time using webhooks
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Fallback polling runs every 5 minutes for missed events
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.CircleSmallFilled size="12px" />
                    <Text size="small">
                      Loop prevention ensures no duplicate syncs
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

export default SyncStatusPage;
