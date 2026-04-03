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
  Dropdown,
  IconButton,
  EmptyState,
  Badge,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import * as Icons from "@wix/wix-ui-icons-common";
import { getInstanceId, apiFetch } from "../../lib/api";

interface FieldMapping {
  id: string;
  wixField: string;
  hubspotProperty: string;
  direction: "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
  transform?: string;
}

interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
}

const WIX_FIELDS = [
  { id: "emailAddress", value: "Email Address" },
  { id: "firstName", value: "First Name" },
  { id: "lastName", value: "Last Name" },
  { id: "phone", value: "Phone" },
  { id: "company", value: "Company" },
  { id: "jobTitle", value: "Job Title" },
  { id: "address", value: "Address" },
  { id: "city", value: "City" },
  { id: "country", value: "Country" },
];

const DIRECTION_OPTIONS = [
  { id: "bidirectional", value: "Bi-directional ↔" },
  { id: "wix_to_hubspot", value: "Wix → HubSpot" },
  { id: "hubspot_to_wix", value: "HubSpot → Wix" },
];

const TRANSFORM_OPTIONS = [
  { id: "none", value: "None" },
  { id: "trim", value: "Trim whitespace" },
  { id: "lowercase", value: "Lowercase" },
  { id: "uppercase", value: "Uppercase" },
];

const CONFLICT_RESOLUTION_OPTIONS = [
  { id: "last_updated_wins", value: "Last Updated Wins" },
  { id: "hubspot_wins", value: "HubSpot Always Wins" },
  { id: "wix_wins", value: "Wix Always Wins" },
];

const FieldMappingPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [hubspotProperties, setHubspotProperties] = useState<HubSpotProperty[]>(
    [],
  );
  const [conflictResolution, setConflictResolution] =
    useState("last_updated_wins");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const instanceId = getInstanceId();

  useEffect(() => {
    fetchData();
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

      const propsRes = await apiFetch(
        `/api/hubspot/properties?instanceId=${instanceId}`,
      );
      const propsData = await propsRes.json();
      setHubspotProperties(propsData.properties || []);

      // Fetch existing mappings
      const mappingsRes = await apiFetch(
        `/api/dashboard/mappings?instanceId=${instanceId}`,
      );
      const mappingsData = await mappingsRes.json();

      if (mappingsData.mappings && mappingsData.mappings.length > 0) {
        setMappings(
          mappingsData.mappings.map((m: any, idx: number) => ({
            id: `${idx}`,
            ...m,
          })),
        );
        setConflictResolution(
          mappingsData.conflictResolution || "last_updated_wins",
        );
      } else {
        setMappings([
          {
            id: "0",
            wixField: "emailAddress",
            hubspotProperty: "email",
            direction: "bidirectional",
          },
        ]);
      }

      setError(null);
    } catch (err) {
      setError("Failed to load field mappings");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMapping = () => {
    const newMapping: FieldMapping = {
      id: Date.now().toString(),
      wixField: "",
      hubspotProperty: "",
      direction: "bidirectional",
    };
    setMappings([...mappings, newMapping]);
  };

  const handleRemoveMapping = (id: string) => {
    setMappings(mappings.filter((m) => m.id !== id));
  };

  const handleUpdateMapping = (
    id: string,
    field: keyof FieldMapping,
    value: any,
  ) => {
    setMappings(
      mappings.map((m) => (m.id === id ? { ...m, [field]: value } : m)),
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const invalidMappings = mappings.filter(
        (m) => !m.wixField || !m.hubspotProperty,
      );

      if (invalidMappings.length > 0) {
        setError("Please fill in all field mappings");
        setSaving(false);
        return;
      }

      const res = await apiFetch("/api/dashboard/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId,
          mappings: mappings.map(({ id, ...rest }) => rest),
          conflictResolution,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save mappings");
      }

      setError(null);
      alert("Field mappings saved successfully!");
    } catch (err) {
      setError("Failed to save mappings");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Page>
          <Page.Header title="Field Mapping" />
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
          <Page.Header title="Field Mapping" />
          <Page.Content>
            <EmptyState
              theme="page"
              title="Connect HubSpot First"
              subtitle="You need to connect your HubSpot account before configuring field mappings"
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

  const hubspotPropertyOptions = hubspotProperties.map((p) => ({
    id: p.name,
    value: `${p.label} (${p.name})`,
  }));

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="Field Mapping"
          subtitle="Configure which fields sync between Wix and HubSpot"
          actionsBar={
            <Button
              onClick={handleSave}
              disabled={saving || mappings.length === 0}
              prefixIcon={<Icons.Saved />}
            >
              {saving ? "Saving..." : "Save Mappings"}
            </Button>
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

            <Card>
              <Card.Header
                title="Field Mappings"
                subtitle="Map Wix contact fields to HubSpot properties"
                suffix={
                  <Button
                    size="small"
                    priority="secondary"
                    onClick={handleAddMapping}
                    prefixIcon={<Icons.Add />}
                  >
                    Add Mapping
                  </Button>
                }
              />
              <Card.Divider />
              <Card.Content>
                {mappings.length === 0 ? (
                  <EmptyState
                    theme="page-no-border"
                    title="No Mappings Yet"
                    subtitle="Add your first field mapping to start syncing data"
                  >
                    <Button
                      onClick={handleAddMapping}
                      prefixIcon={<Icons.Add />}
                    >
                      Add Mapping
                    </Button>
                  </EmptyState>
                ) : (
                  <Table
                    data={mappings}
                    columns={[
                      {
                        title: "Wix Field",
                        render: (row: FieldMapping) => (
                          <Dropdown
                            placeholder="Select Wix field"
                            options={WIX_FIELDS}
                            selectedId={row.wixField}
                            onSelect={(option) =>
                              handleUpdateMapping(row.id, "wixField", option.id)
                            }
                          />
                        ),
                      },
                      {
                        title: "Direction",
                        render: (row: FieldMapping) => (
                          <Dropdown
                            options={DIRECTION_OPTIONS}
                            selectedId={row.direction}
                            onSelect={(option) =>
                              handleUpdateMapping(
                                row.id,
                                "direction",
                                option.id,
                              )
                            }
                          />
                        ),
                      },
                      {
                        title: "HubSpot Property",
                        render: (row: FieldMapping) => (
                          <Dropdown
                            placeholder="Select HubSpot property"
                            options={hubspotPropertyOptions}
                            selectedId={row.hubspotProperty}
                            onSelect={(option) =>
                              handleUpdateMapping(
                                row.id,
                                "hubspotProperty",
                                option.id,
                              )
                            }
                          />
                        ),
                      },
                      {
                        title: "Transform",
                        render: (row: FieldMapping) => (
                          <Dropdown
                            options={TRANSFORM_OPTIONS}
                            selectedId={row.transform || "none"}
                            onSelect={(option) =>
                              handleUpdateMapping(
                                row.id,
                                "transform",
                                option.id,
                              )
                            }
                          />
                        ),
                      },
                      {
                        title: "",
                        width: "50px",
                        render: (row: FieldMapping) => (
                          <IconButton
                            size="small"
                            priority="secondary"
                            skin="destructive"
                            onClick={() => handleRemoveMapping(row.id)}
                          >
                            <Icons.Delete />
                          </IconButton>
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
              <Card.Header
                title="Conflict Resolution"
                subtitle="What happens when the same contact is updated in both systems?"
              />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP2">
                  <Dropdown
                    options={CONFLICT_RESOLUTION_OPTIONS}
                    selectedId={conflictResolution}
                    onSelect={(option) =>
                      setConflictResolution(option.id as string)
                    }
                  />
                  <Text size="small" secondary>
                    {conflictResolution === "last_updated_wins" &&
                      "The most recently updated value will be used (recommended)"}
                    {conflictResolution === "hubspot_wins" &&
                      "HubSpot values will always override Wix values"}
                    {conflictResolution === "wix_wins" &&
                      "Wix values will always override HubSpot values"}
                  </Text>
                </Box>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header title="Important Notes" />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP2">
                  <Box gap="SP2">
                    <Icons.InfoCircle />
                    <Text size="small">
                      Email address is required and should always be mapped
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.InfoCircle />
                    <Text size="small">
                      Changes take effect immediately after saving
                    </Text>
                  </Box>
                  <Box gap="SP2">
                    <Icons.InfoCircle />
                    <Text size="small">
                      Bi-directional sync keeps both systems in sync
                      automatically
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

export default FieldMappingPage;
