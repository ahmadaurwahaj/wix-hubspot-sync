import type { APIRoute } from "astro";
import { DatabaseService } from "../../../backend/services/database.service";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const instanceId = body.instanceId;

    if (!instanceId) {
      return new Response(JSON.stringify({ error: "Missing instanceId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await DatabaseService.deleteConnection(instanceId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Disconnected successfully",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/oauth/disconnect] Error:", error);
    return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
