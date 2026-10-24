import type {
  AgentPermissionOption,
  AgentPlanApprovalOutcome,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { control, layout, space, useThemeColors } from "@/theme";
import { ActionButton, type ActionButtonVariant } from "@/ui";
import { PermissionPrompt } from "./permission-prompt";
import type { PendingInteraction } from "./transcript";

export interface InteractionActions {
  resolvePermission(requestId: string, optionId: string): Promise<void>;
  answerQuestion(questionId: string, answer: string): Promise<void>;
  resolvePlan(approvalId: string, outcome: AgentPlanApprovalOutcome): void;
}

const OPTION_VARIANT: Record<
  AgentPermissionOption["kind"],
  ActionButtonVariant
> = {
  allow_once: "primary",
  allow_always: "secondary",
  reject_once: "destructive",
  reject_always: "destructive",
};

const OPTION_ORDER: AgentPermissionOption["kind"][] = [
  "reject_always",
  "reject_once",
  "allow_always",
  "allow_once",
];

function byOptionOrder(
  left: AgentPermissionOption,
  right: AgentPermissionOption,
) {
  return OPTION_ORDER.indexOf(left.kind) - OPTION_ORDER.indexOf(right.kind);
}

function DockTitle({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.titleLine}>
      <View
        style={[styles.dot, { backgroundColor: colors.chatStatusPendingText }]}
      />
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.foreground }]}
      >
        {children}
      </Text>
    </View>
  );
}

function Muted({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text style={[styles.description, { color: colors.mutedForeground }]}>
      {children}
    </Text>
  );
}

function QuestionAnswer({
  onAnswer,
}: {
  onAnswer(answer: string): Promise<void>;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const [answer, setAnswer] = useState("");
  return (
    <View style={styles.answerLine}>
      <TextInput
        testID="question-answer"
        value={answer}
        onChangeText={setAnswer}
        placeholder={t("question.placeholder")}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.answerInput,
          { borderColor: colors.input, color: colors.foreground },
        ]}
      />
      <ActionButton
        variant="primary"
        label={t("question.reply")}
        disabled={answer.trim() === ""}
        onPress={() => void onAnswer(answer.trim())}
      />
    </View>
  );
}

function DockBody({
  pending,
  actions,
}: {
  pending: PendingInteraction;
  actions: InteractionActions;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  if (pending.kind === "permission") {
    const { record } = pending;
    return (
      <>
        <PermissionPrompt
          record={record}
          title={(text) => <DockTitle>{text}</DockTitle>}
        />
        <View style={styles.actions}>
          {[...record.options].sort(byOptionOrder).map((option) => (
            <ActionButton
              key={option.id}
              grow
              label={option.label}
              variant={OPTION_VARIANT[option.kind]}
              onPress={() =>
                void actions.resolvePermission(record.id, option.id)
              }
            />
          ))}
        </View>
      </>
    );
  }
  if (pending.kind === "question") {
    const { record } = pending;
    const answer = (value: string) => actions.answerQuestion(record.id, value);
    return (
      <>
        <DockTitle>{record.header ?? t("question.title")}</DockTitle>
        <Text style={[styles.body, { color: colors.foreground }]}>
          {record.question}
        </Text>
        {record.options?.length ? (
          <View style={styles.actions}>
            {record.options.map((option) => (
              <ActionButton
                key={option.label}
                grow
                label={option.label}
                onPress={() => void answer(option.label)}
              />
            ))}
          </View>
        ) : null}
        <QuestionAnswer key={record.id} onAnswer={answer} />
      </>
    );
  }
  const { record } = pending;
  return (
    <>
      <DockTitle>{t("plan.title")}</DockTitle>
      {record.planContent ? (
        <ScrollView
          style={[styles.plan, { backgroundColor: colors.muted }]}
          contentContainerStyle={styles.planContent}
        >
          <Text
            selectable
            style={[styles.planText, { color: colors.foreground }]}
          >
            {record.planContent}
          </Text>
        </ScrollView>
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          grow
          label={t("plan.keepPlanning")}
          onPress={() => actions.resolvePlan(record.id, "cancelled")}
        />
        <ActionButton
          grow
          variant="primary"
          label={t("plan.approve")}
          onPress={() => actions.resolvePlan(record.id, "approved")}
        />
      </View>
    </>
  );
}

export function InteractionDock({
  pending,
  canApprove,
  actions,
}: {
  pending: PendingInteraction;
  canApprove: boolean;
  actions: InteractionActions;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  return (
    <View
      accessibilityRole="summary"
      testID="interaction-dock"
      style={[
        styles.dock,
        { backgroundColor: colors.popover, borderTopColor: colors.border },
      ]}
    >
      {canApprove ? (
        <DockBody pending={pending} actions={actions} />
      ) : (
        <>
          <DockTitle>{t("approvalsUnavailable.title")}</DockTitle>
          <Muted>{t("approvalsUnavailable.description")}</Muted>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    gap: space.md,
    paddingHorizontal: layout.sideMargin,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: "600" },
  description: { fontSize: 15, lineHeight: 21 },
  body: { fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  answerLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  answerInput: {
    flex: 1,
    height: control.standard.height,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: control.standard.radius,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  plan: { maxHeight: 220, borderRadius: control.standard.radius },
  planContent: { padding: space.md },
  planText: { fontSize: 14, lineHeight: 20 },
});
