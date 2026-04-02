import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://nidoqmcxmlyiovdktzxg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZG9xbWN4bWx5aW92ZGt0enhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTU4MzMsImV4cCI6MjA5MDYzMTgzM30.VsS9riN0vYfMcseuZsJ4hncgD4WbxJm2uimR5VVq2Us'
)
