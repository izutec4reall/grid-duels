import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "grid-duels",
  name: "Grid Duels",
  description:
    "Play tic-tac-toe, connect four and five in a row against teammates or the computer, with ratings and tournaments.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
  },
});
