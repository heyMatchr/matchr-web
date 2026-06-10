export const GENDER_IDENTITY_OPTIONS = [
  "Woman",
  "Man",
  "Non-binary",
  "Trans woman",
  "Trans man",
  "Genderfluid",
  "Agender",
  "Other",
  "Prefer not to say",
] as const;

export const PRONOUN_OPTIONS = [
  "she/her",
  "he/him",
  "they/them",
  "she/they",
  "he/they",
  "other",
  "prefer not to say",
] as const;

export const SEXUAL_ORIENTATION_OPTIONS = [
  "Straight",
  "Gay",
  "Lesbian",
  "Bisexual",
  "Pansexual",
  "Queer",
  "Asexual",
  "Questioning",
  "Other",
  "Prefer not to say",
] as const;

export const RELATIONSHIP_INTENT_OPTIONS = [
  "Long-term",
  "Intentional",
  "Casual",
  "Exploring",
] as const;

const HIDDEN_VALUE = "Prefer not to say";

export function isVisibleIdentityValue(value: string | null | undefined) {
  return Boolean(value && value !== HIDDEN_VALUE && value !== "prefer not to say");
}

export function parseMultiSelectFormValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

export function profileMatchesIdentityPreferences({
  inclusiveMode,
  interestedInGenderIdentities,
  interestedInOrientations,
  targetGenderIdentity,
  targetSexualOrientation,
}: {
  inclusiveMode: boolean;
  interestedInGenderIdentities: string[];
  interestedInOrientations: string[];
  targetGenderIdentity: string | null;
  targetSexualOrientation: string | null;
}) {
  if (inclusiveMode) {
    return true;
  }

  if (
    interestedInGenderIdentities.length > 0 &&
    (!targetGenderIdentity ||
      !interestedInGenderIdentities.includes(targetGenderIdentity))
  ) {
    return false;
  }

  if (
    interestedInOrientations.length > 0 &&
    (!targetSexualOrientation ||
      !interestedInOrientations.includes(targetSexualOrientation))
  ) {
    return false;
  }

  return true;
}
