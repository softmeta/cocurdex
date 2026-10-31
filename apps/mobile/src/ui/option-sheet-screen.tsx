import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseButton } from "./close-button";
import { FieldSection } from "./field-section";
import { Form } from "./form";
import { FormRow } from "./form-row";
import { FormSection } from "./form-section";
import { FormText } from "./form-text";
import { FormTextField } from "./form-text-field";
import { matchesQuery } from "./option-query";
import { useOptionSheetRoute } from "./option-sheet-route";
import {
  type OptionSheetItem,
  optionSheetRequest,
  selectOptionFrom,
} from "./option-sheet-store";
import { SelectedMark } from "./row-accessory";

const SEARCH_AFTER_ITEMS = 10;

function OptionRow({
  item,
  onSelect,
}: {
  item: OptionSheetItem;
  onSelect(item: OptionSheetItem): void;
}) {
  return (
    <FormRow
      testID={item.testID}
      selected={item.selected}
      supporting={item.supporting}
      leading={item.leading}
      trailing={<SelectedMark selected={item.selected === true} />}
      onPress={() => onSelect(item)}
    >
      <FormText tone={item.destructive ? "destructive" : "default"}>
        {item.label}
      </FormText>
    </FormRow>
  );
}

export function OptionSheetScreen({
  closesSheet = false,
}: {
  closesSheet?: boolean;
}) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const navigation = useNavigation();
  const route = useOptionSheetRoute();
  const params = useLocalSearchParams<{ id: string; depth: string }>();
  const depth = Number(params.depth) || 1;
  const request = optionSheetRequest(params.id);
  const [query, setQuery] = useState("");
  const items = request?.items ?? [];
  const searchable = items.length > SEARCH_AFTER_ITEMS;
  const shown = searchable
    ? items.filter((item) => matchesQuery(item, query))
    : items;

  const close = () => {
    if (closesSheet) navigation.getParent()?.goBack();
    else router.dismiss(depth);
  };
  const select = (item: OptionSheetItem) => {
    const here = { pathname: route.pathname, params: route.params, depth };
    if (!selectOptionFrom(here, item)) close();
  };

  return (
    <>
      <Stack.Screen options={{ title: request?.title ?? "" }} />
      {closesSheet && depth === 1 ? (
        <CloseButton accessibilityLabel={t("actions.close")} onPress={close} />
      ) : null}
      <Form adjustsForKeyboard={searchable}>
        {searchable ? (
          <FieldSection>
            <FormTextField
              testID="option-sheet-search"
              placeholder={t("optionSearch.placeholder")}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onChangeText={setQuery}
            />
          </FieldSection>
        ) : null}
        <FormSection
          footer={
            searchable && shown.length === 0
              ? t("optionSearch.empty")
              : (request?.subtitle ?? undefined)
          }
        >
          {shown.map((item) => (
            <OptionRow key={item.key} item={item} onSelect={select} />
          ))}
        </FormSection>
      </Form>
    </>
  );
}
