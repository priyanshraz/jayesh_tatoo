import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const { report_id, report_data, ads_config } = await request.json()

    if (!report_id || !report_data) {
      return Response.json(
        { success: false, error: 'Missing report_id or report_data' },
        { status: 400 }
      )
    }

    // Update Supabase: mark ads workflow as triggered
    const { error: dbError } = await supabase
      .from('reports_json')
      .update({ ads_workflow_triggered: true })
      .eq('id', report_id)

    if (dbError) {
      return Response.json(
        { success: false, error: dbError.message },
        { status: 500 }
      )
    }

    // Call external webhook with full report data
    try {
      await fetch('https://n8n.srv881198.hstgr.cloud/webhook/generate_ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id, report_data, ads_config: ads_config || {} }),
      })
    } catch (webhookError) {
      // Log but don't fail - the DB update succeeded
      console.error('Webhook call failed:', webhookError.message)
    }

    return Response.json({ success: true, report_id })
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
