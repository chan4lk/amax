import { declarePayload, defineModule } from "@amax/core";
import { EVENTS, type DeliveryRecorded } from "./contracts";
import { notificationFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { MANAGE, READ } from "./server/context";
import { deliverNotification } from "./server/deliver";
import { digestSchedules, sendDigest } from "./server/digest";
import { NOTIFY } from "./server/notify";
import { DELIVER_PERMISSION } from "./server/record";
import { ruleHandlers } from "./server/rules";
import { Bell } from "./ui/Bell";
import { NotificationsPage } from "./ui/NotificationsPage";

const OWN = [READ, MANAGE];

export default defineModule({
  id: "notifications",
  title: "Notifications",
  icon: "bell",
  group: "Operations",
  menu: "profile",
  dependsOn: [],
  integratesWith: [],
  // notify and deliver are the system jobs' own: no role is granted them.
  permissions: [READ, MANAGE, NOTIFY, DELIVER_PERMISSION],
  grants: { ITAdmin: OWN, Leadership: OWN, PM: OWN, Engineer: OWN, Finance: OWN, Sales: OWN, HR: OWN, Payroll: OWN, Employee: OWN },
  routes: [{ path: "", title: "Notifications", component: NotificationsPage }],
  topBar: Bell,
  mcpTools,
  retention: [
    { table: "notifications.notification", label: "Notifications", subject: ["user_id"], fields: ["title", "body"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" },
    { table: "notifications.delivery", label: "Notification deliveries", subject: ["user_id"], fields: ["error"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" },
    { table: "notifications.preference", label: "Notification preferences", subject: ["user_id"], fields: ["category"], keep: { email: "an on/off flag for the email channel, not an address" }, class: "personal", period: "P2Y", start: { at: [], idle: "P2Y" }, action: "delete" },
    { table: "notifications.quiet_hours", label: "Quiet hours", subject: ["user_id"], fields: ["starts", "ends"], class: "personal", period: "P2Y", start: { at: [], idle: "P2Y" }, action: "delete" },
  ],
  workflows: [deliverNotification, sendDigest],
  schedules: digestSchedules,
  events: {
    emits: Object.values(EVENTS),
    handlesFrom: ruleHandlers,
    payloads: {
      [EVENTS.created]: { userId: "plain", ruleId: "plain", eventId: "plain", category: "plain", urgent: "plain" },
      [EVENTS.delivered]: declarePayload<DeliveryRecorded>({ deliveryId: "plain", notificationId: "plain", userId: "plain", channel: "plain", adapter: "plain", status: "plain" }),
      [EVENTS.preferenceSet]: { userId: "plain", category: "plain", email: "plain", teams: "plain", digest: "plain" },
      [EVENTS.quietHoursSet]: { userId: "plain", quietHours: "plain" },
      [EVENTS.read]: { userId: "plain", count: "plain" },
    },
  },
  fixtures: [notificationFixtures],
});
