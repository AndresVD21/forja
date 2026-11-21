"use client";
// Client Component: typing, arrow keys, focus and the open/closed list are all browser state.
//
// An editable combobox (WAI-ARIA "combobox with list autocomplete"): the text box keeps DOM focus the whole
// time; the highlighted option is announced through aria-activedescendant instead of moving focus.
// The name is free text: suggestions help, but nothing is forced until Save (rule 12 handled on blur).

import { Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent, type RefObject } from "react";
import { IconButton } from "@/components/icon-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EntryExercise } from "@/server/queries";
import { filterExercises, findExactMatch } from "./draft";

export function exerciseDisplayName(exercise: EntryExercise, locale: string): string {
  return locale === "es" ? exercise.nameEs : exercise.nameEn;
}

type Props = {
  exercises: EntryExercise[];
  text: string;
  /** Shown under the field when Save found a problem with the name. */
  problem?: string;
  /** Typing: the parent also forgets any chosen exercise, so an old id never stays on edited text. */
  onTextChange: (text: string) => void;
  onSelect: (exercise: EntryExercise) => void;
  /** "Use “name”": the person wants a new exercise. Opens the setup sheet; nothing is created here. */
  onUseName: (name: string) => void;
  selectedId: string | null;
  /** So the card can put focus back here when the setup sheet closes. */
  inputRef: RefObject<HTMLInputElement | null>;
};

export function ExerciseCombobox({ exercises, text, problem, onTextChange, onSelect, onUseName, selectedId, inputRef }: Props) {
  const t = useTranslations("Entry");
  const locale = useLocale();
  const id = useId();
  const listId = `${id}-list`;
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false); // Escape closes the list until the next keystroke
  const [active, setActive] = useState(-1);

  // Right after a pick the text equals the chosen name; no need to suggest it again.
  const suggestions = selectedId === null ? filterExercises(text, exercises, locale) : [];
  // A name that is not exactly an existing exercise can be saved as a new one: one extra option at the end.
  const canUseName = selectedId === null && text.trim() !== "" && !findExactMatch(text, exercises);
  const optionCount = suggestions.length + (canUseName ? 1 : 0);
  const open = focused && !dismissed && optionCount > 0;
  const activeIndex = Math.min(active, optionCount - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  function pick(exercise: EntryExercise) {
    onSelect(exercise);
    setDismissed(true);
    setActive(-1);
  }

  function openSetup() {
    onUseName(text.trim());
    setDismissed(true);
    setActive(-1);
  }

  function chooseOption(index: number) {
    if (index < suggestions.length) pick(suggestions[index]);
    else openSetup();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (optionCount === 0) return;
      event.preventDefault();
      setDismissed(false);
      const last = optionCount - 1;
      if (event.key === "ArrowDown") setActive(activeIndex >= last ? 0 : activeIndex + 1);
      else setActive(activeIndex <= 0 ? last : activeIndex - 1);
    } else if (event.key === "Enter") {
      // Never let Enter do anything else here (and an open list means "choose the highlighted one").
      event.preventDefault();
      if (open && activeIndex >= 0) chooseOption(activeIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setDismissed(true);
    }
  }

  function handleBlur() {
    setFocused(false);
    // An exact name or alias in either language is the same exercise: use it instead of leaving loose text.
    if (selectedId === null) {
      const match = findExactMatch(text, exercises);
      if (match) onSelect(match);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-xl font-bold">
        {t("exerciseName")}
      </Label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          type="text"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("exerciseSearchPlaceholder")}
          value={text}
          onChange={(event) => {
            onTextChange(event.target.value);
            setDismissed(false);
            setActive(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-12 w-full rounded-xl border border-field bg-surface pl-10 pr-14 text-base text-ink placeholder:text-muted"
        />
        {text !== "" && (
          <div className="absolute inset-y-0 right-1 flex items-center">
            <IconButton
              label={t("clearName")}
              // mouseDown would blur the input before the click lands, and blur may auto-select a match.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onTextChange("")}
            >
              <X aria-hidden />
            </IconButton>
          </div>
        )}
      </div>

      {/* Always rendered so aria-controls points at something real; hidden while closed. */}
      <ul
        id={listId}
        role="listbox"
        aria-label={t("suggestions")}
        hidden={!open}
        className="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        {suggestions.map((exercise, index) => (
          <li
            key={exercise.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            // Keep focus in the text box: a tap must not blur it before the click is handled.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(exercise)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center px-4 py-2 text-base font-medium",
              index === activeIndex ? "bg-accent text-accent-ink" : "text-ink hover:bg-page",
            )}
          >
            {exerciseDisplayName(exercise, locale)}
          </li>
        ))}
        {canUseName && (
          <li
            id={optionId(suggestions.length)}
            role="option"
            aria-selected={suggestions.length === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openSetup}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2",
              suggestions.length > 0 && "border-t border-line",
              suggestions.length === activeIndex ? "bg-accent text-accent-ink" : "text-ink hover:bg-page",
            )}
          >
            <Plus aria-hidden className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="break-words text-base font-semibold">{t("useName", { name: text.trim() })}</span>
              <span className="text-sm">{t("useNameHelp")}</span>
            </span>
          </li>
        )}
      </ul>

      {/* Screen readers hear how many suggestions there are as they type. */}
      <p role="status" className="sr-only">
        {open ? t("suggestionsAvailable", { count: optionCount }) : ""}
      </p>

      {canUseName && <p className="text-sm text-muted">{t("noMatch")}</p>}
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-sm font-medium text-ink">
          {problem}
        </p>
      )}
    </div>
  );
}
