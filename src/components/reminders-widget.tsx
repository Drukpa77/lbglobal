import { RemindersCarousel } from "@/components/reminders-carousel";
import type { Reminder } from "@/lib/reminders";

type Props = {
  reminders: Reminder[];
  title?: string;
  maxItems?: number;
};

export function RemindersWidget({ reminders, title = "Reminders", maxItems = 10 }: Props) {
  const displayed = reminders.slice(0, maxItems);

  if (reminders.length === 0) {
    return null;
  }

  return (
    <RemindersCarousel
      reminders={displayed.map((reminder) => ({
        id: reminder.id,
        type: reminder.type,
        severity: reminder.severity,
        title: reminder.title,
        description: reminder.description,
        link: reminder.link,
        dateLabel: reminder.date.toLocaleDateString(),
      }))}
      title={title}
      totalCount={reminders.length}
      hiddenCount={Math.max(reminders.length - maxItems, 0)}
    />
  );
}
