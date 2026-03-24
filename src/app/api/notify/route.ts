import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { differenceInCalendarDays } from 'date-fns';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  // Simple auth check
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all projects with their settings
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
            ? `${Math.abs(daysLeft)}日超過`
            : daysLeft === 0
            ? '本日期限'
            : `あと${daysLeft}日`;

          urgentItems.push(`  ${item.name}：${label}（未完了${count}件）`);
        }
      }
    }

    if (urgentItems.length > 0) {
      const assigneeName = (project.users as { name: string } | null)?.name || '未割当';
      const msg = `【施工管理】${project.name}（担当：${assigneeName}）\n${urgentItems.join('\n')}`;
      notifications.push(msg);
    }
  }

  // Send LINE Notify
  const lineToken = process.env.LINE_NOTIFY_TOKEN;
  if (lineToken && notifications.length > 0) {
    const message = '\n' + notifications.join('\n\n');
    try {
      await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lineToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ message }),
      });
    } catch (err) {
      console.error('LINE Notify error:', err);
    }
  }

  // Send email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.NOTIFICATION_EMAIL_TO;
  if (resendKey && emailTo && notifications.length > 0) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'noreply@resend.dev',
          to: emailTo.split(','),
          subject: `【施工管理】期限通知（${notifications.length}件）`,
          text: notifications.join('\n\n'),
        }),
      });
    } catch (err) {
      console.error('Email error:', err);
    }
  }

  return NextResponse.json({
    sent: notifications.length,
    notifications,
  });
}
