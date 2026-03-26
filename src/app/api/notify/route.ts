import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { differenceInCalendarDays } from 'date-fns';
import nodemailer from 'nodemailer';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  // Auth check
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*, users!projects_assignee_id_fkey(name)');

  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No projects found' });
  }

  const notifications: string[] = [];

  for (const project of projects) {
    const notifyDays = project.notify_days_before || 7;

    const { data: items } = await supabase
      .from('items')
      .select('id, name, deadline')
      .eq('project_id', project.id)
      .is('merged_into_id', null);

    if (!items) continue;

    const urgentItems: string[] = [];

    for (const item of items) {
      const daysLeft = differenceInCalendarDays(new Date(item.deadline), today);

      if (daysLeft <= notifyDays) {
        const { count } = await supabase
          .from('checks')
          .select('*', { count: 'exact', head: true })
          .eq('item_id', item.id)
          .eq('checked', false);

        if (count && count > 0) {
          const label = daysLeft < 0
            ? `⚠️ ${Math.abs(daysLeft)}日超過`
            : daysLeft === 0
            ? '⚠️ 本日期限'
            : `あと${daysLeft}日`;

          urgentItems.push(`  ・${item.name}：${label}（未完了${count}件）`);
        }
      }
    }

    if (urgentItems.length > 0) {
      const assigneeName = (project.users as { name: string } | null)?.name || '未割当';
      const msg = `■ ${project.name}（担当：${assigneeName}）\n${urgentItems.join('\n')}`;
      notifications.push(msg);
    }
  }

  if (notifications.length === 0) {
    return NextResponse.json({ message: 'No urgent items', sent: 0 });
  }

  // Send email via Gmail SMTP
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const emailTo = process.env.NOTIFICATION_EMAIL_TO;

  let emailResult = 'skipped';

  if (gmailUser && gmailPass && emailTo) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      const emailBody = `施工管理チェックアプリからの自動通知です。\n\n`
        + `以下の案件で期限が迫っている、または超過している明細があります。\n\n`
        + notifications.join('\n\n')
        + `\n\n──────────────\n`
        + `アプリで確認: https://construction-app-kohl.vercel.app/projects\n`
        + `※このメールは自動送信です`;

      await transporter.sendMail({
        from: `施工管理チェック <${gmailUser}>`,
        to: emailTo,
        subject: `【施工管理】期限通知 ${notifications.length}件の案件に注意`,
        text: emailBody,
      });

      emailResult = `sent to ${emailTo.split(',').length} addresses`;
    } catch (err) {
      console.error('Gmail send error:', err);
      emailResult = `error: ${err instanceof Error ? err.message : 'unknown'}`;
    }
  }

  return NextResponse.json({
    sent: notifications.length,
    email: emailResult,
    notifications,
  });
}
