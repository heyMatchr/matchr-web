export type AuthFormState = {
  status: "idle" | "error" | "success";
  message: string;
};

export type LogoutFormState = {
  status: "idle" | "error";
  message: string;
};
