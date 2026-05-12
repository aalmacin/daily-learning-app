import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { upsertUserSettings } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const storedState = request.cookies.get('notion_oauth_state')?.value;

  if (error || !code || !state || state !== storedState) {
    return NextResponse.redirect(new URL('/settings?error=notion_auth_failed', request.url));
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/notion/callback`;
  const basicCredentials = Buffer.from(
    `${process.env.NOTION_OAUTH_CLIENT_ID}:${process.env.NOTION_OAUTH_CLIENT_SECRET}`,
  ).toString('base64');

  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicCredentials}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL('/settings?error=notion_token_failed', request.url));
  }

  const { access_token } = (await tokenResponse.json()) as { access_token: string };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  await upsertUserSettings(user.id, {
    notion_api_key: access_token,
    notion_database_id: null,
  });

  const response = NextResponse.redirect(new URL('/settings', request.url));
  response.cookies.delete('notion_oauth_state');
  return response;
}
