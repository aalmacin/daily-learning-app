import { NextResponse, type NextRequest } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get('next') ?? '/set-password';
  const origin = request.nextUrl.origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=Invite+link+expired+or+invalid`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=Invite+link+expired+or+invalid`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
