import { seedIfNeeded } from "../src/lib/seed";

seedIfNeeded()
  .then(() => {
    console.log("seed ok");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
