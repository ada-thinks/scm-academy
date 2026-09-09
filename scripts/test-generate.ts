import { readFile } from "node:fs/promises";
import { generateCourseLocally } from "../src/lib/ai";
import { extractText } from "../src/lib/parse-document";

async function main() {
  const file = "samples/库存管理系统操作手册.md";
  const buffer = await readFile(file);
  const text = await extractText(file, buffer);
  const course = generateCourseLocally(text, file);
  console.log(
    JSON.stringify(
      {
        title: course.title,
        chapters: course.chapters.map((c) => ({
          title: c.title,
          questions: c.questions.length,
          cases: c.cases.length,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
