"use client";
// Client Component: typing, arrow keys, focus and the open/closed list are all browser state.
//
// An editable combobox (WAI-ARIA "combobox with list autocomplete"): the text box keeps DOM focus the whole
// time; the highlighted option is announced through aria-activedescendant instead of moving focus.
// The name is free text: suggestions help, but nothing is forced until Save (rule 12 handled on blur).

import { Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
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
  selectedId: string | null;
};

export function ExerciseCombobox({ exercises, text, problem, onTextChange, onSelect, selectedId }: Props) {
  const t = useTranslations("Entry");
  const locale = useLocale();
  const id = useId();
  const listId = `${id}-list`;
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false); // Escape closes the list until the next keystroke
  const [active, setActive] = useState(-1);

  // Right after a pick the text equals the chosen name; no need to suggest it again.
  const suggestions = selectedId === null ? filterExercises(text, exercises, locale) : [];
  const open = focused && !dismissed && suggestions.length > 0;
  const nothingMatches = selectedId === null && text.trim() !== "" && suggestions.length === 0;
  const activeIndex = Math.min(active, suggestions.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  function pick(exercise: EntryExercise) {
    onSelect(exercise);
    setDismissed(true);
    setActive(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setDismissed(false);
      const last = suggestions.length - 1;
      if (event.key === "ArrowDown") setActive(activeIndex >= last ? 0 : activeIndex + 1);
      else setActive(activeIndex <= 0 ? last : activeIndex - 1);
    } else if (event.key === "Enter") {
      // Never let Enter do anything else here (and an open list means "choose the highlighted one").
      event.preventDefault();
      if (open && activeIndex >= 0) pick(suggestions[activeIndex]);
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
      </ul>

      {/* Screen readers hear how many suggestions there are as they type. */}
      <p role="status" className="sr-only">
        {open ? t("suggestionsAvailable", { count: suggestions.length }) : focused && nothingMatches ? t("noSuggestions") : ""}
      </p>

      {nothingMatches && <p className="text-sm text-muted">{t("noMatch")}</p>}
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-sm font-medium text-ink">
          {problem}
        </p>
      )}
    </div>
  );
}
