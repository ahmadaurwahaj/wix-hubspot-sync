import { submissions } from '@wix/forms';

export default submissions.onSubmissionCreated(async (event: any) => {
  console.log('=== WIX FORM SUBMISSION EVENT (onSubmissionCreated) ===');
  console.log('Full event:', JSON.stringify(event, null, 2));

  try {
    const { DatabaseService } = await import('../../../../backend/services/database.service');
    const { SyncService } = await import('../../../../backend/services/sync.service');
    const { TokenManager } = await import('../../../../backend/utils/token-manager');

    // Extract entity — handle both SDK-normalized shape and raw webhook shape
    const submission = event.entity ?? event.createdEvent?.entity;
    if (!submission) {
      console.log('WARNING: No submission entity found in event');
      return;
    }

    const formId = submission.formId;
    // submissions is a key-value object: { "first_name": "Baxter", "email_d952": "..." }
    const submissionFields = submission.submissions ?? {};

    console.log('Form ID:', formId);
    console.log('Submission fields:', JSON.stringify(submissionFields));

    // Get instanceId from metadata, or fall back to the active connection
    let instanceId = event.metadata?.instanceId;
    const connection = instanceId
      ? await DatabaseService.getConnection(instanceId)
      : await DatabaseService.getActiveConnection();

    if (!connection || connection.status !== 'connected') {
      console.log('No active HubSpot connection, skipping form sync');
      return;
    }
    instanceId = instanceId || connection.siteId;
    console.log('Instance/Site ID:', instanceId);

    // Get valid access token
    const accessToken = await TokenManager.getValidAccessToken(instanceId);

    // Build the event shape that SyncService.submitFormToHubSpot expects
    // Pass the submissions dict as-is — extractFormFields handles both dict and array formats
    const formEvent = {
      formSubmission: {
        formId: formId ?? '',
        submissions: submissionFields,
      },
      instanceId,
    };

    // Submit form data to HubSpot
    console.log('Submitting form data to HubSpot...');
    await SyncService.submitFormToHubSpot(formEvent as any, instanceId, accessToken);

    console.log('=== FORM SUBMISSION PROCESSED SUCCESSFULLY ===');
  } catch (error) {
    console.error('=== FORM SUBMISSION ERROR ===');
    console.error('Error:', error);
  }
});
