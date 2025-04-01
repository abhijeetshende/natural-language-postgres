import { sql } from "@vercel/postgres";
import fs from "fs";
import csv from "csv-parser";
import path from "path";
import "dotenv/config";

// Function to parse and format date to YYYY-MM-DD
function parseDate(dateString: string): string {
  const parts = dateString.split("/");

  if (parts.length === 3) {
    let day = parts[0].padStart(2, "0");
    let month = parts[1].padStart(2, "0");
    let year = parts[2];

    // Handle two-digit year format (e.g., 12 -> 2012)
    if (year.length === 2) {
      year = "20" + year;
    }

    return `${year}-${month}-${day}`;
  }

  console.warn(`Could not parse date: ${dateString}`);
  throw Error();
}

export async function seed() {
  // Drop the unicorns table if it exists
  await sql`
    DROP TABLE IF EXISTS unicorns;
  `;
  console.log('Dropped "unicorns" table if it existed');

  // Create the unicorns table again
  const createTable = await sql`
    CREATE TABLE unicorns (
      id SERIAL PRIMARY KEY,
      company VARCHAR(255) NOT NULL UNIQUE,
      valuation DECIMAL(10, 2) NOT NULL,
      date_joined DATE,
      country VARCHAR(255) NOT NULL,
      city VARCHAR(255) NOT NULL,
      industry VARCHAR(255) NOT NULL,
      select_investors TEXT NOT NULL
    );
  `;
  console.log(`Created "unicorns" table`);

  const results: any[] = [];
  const csvFilePath = path.join(process.cwd(), "unicorns.csv");

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv({}))
      .on("data", (data) => {
        // Filter out rows that don't contain relevant data
        if (data["Company"] && data["Valuation ($B)"] && data["Date Joined"]) {
          console.log("Parsed row:", data); // Log each parsed row
          results.push(data);
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`Parsed ${results.length} rows from CSV`);

  // Check if rows were parsed correctly
  if (results.length === 0) {
    console.warn(
      "No valid rows found in the CSV file. Please check the CSV content."
    );
    return;
  }

  // Insert data into the table
  for (const row of results) {
    try {
      const formattedDate = parseDate(row["Date Joined"]);
      await sql`
        INSERT INTO unicorns (company, valuation, date_joined, country, city, industry, select_investors)
        VALUES (
          ${row.Company},
          ${parseFloat(
            row["Valuation ($B)"].replace("$", "").replace(",", "")
          )},
          ${formattedDate},
          ${row.Country},
          ${row.City},
          ${row.Industry},
          ${row["Select Investors"]}
        )
        ON CONFLICT (company) DO NOTHING;
      `;
    } catch (err) {
      console.error(`Error inserting row for ${row.Company}:`, err);
    }
  }

  console.log(`Seeded ${results.length} unicorns`);

  return {
    createTable,
    unicorns: results,
  };
}
seed().catch(console.error);
