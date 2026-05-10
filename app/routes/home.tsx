import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dice Demons" },
    { name: "description", content: "Roll your Pixel dice!" },
  ];
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
        Dice Demons
      </h1>
      <Link
        to="/list"
        className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
      >
        Dice List Picker
      </Link>
      <Link
        to="/hammer-of-wilderwood"
        className="rounded-xl bg-gray-800 px-6 py-3 text-sm font-medium text-white hover:bg-gray-700 active:bg-gray-600"
      >
        Hammer of Wilderwood
      </Link>
    </main>
  );
}
