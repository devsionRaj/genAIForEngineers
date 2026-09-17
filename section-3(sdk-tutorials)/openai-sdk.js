import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import 'dotenv/config';

const openai = new OpenAI();

const VehicleDetails = z.object({
    vehicles: z.array(z.object({
        name: z.string().describe("The name of the car or vehicle"),
        launchDate: z.string().describe("The launch date of the vehicle in date format, such as YYYY-MM-DD"),
        availableInCities: z.array(z.string()).describe("List of the cities where this vehicle is available"),
        vehicleType: z.array(z.string()).describe('Class or type in which the vehcile fits in')
    })),
    data: z.string().describe('A basic intro')
});


const response = await openai.responses.parse({
    model: "gpt-5.6-luna",
    input: [
        { role: "system", content: "Extract the vehicles information." },
        {
            role: "user",
            content: "The Indian automotive market features a mix of high-demand compact models, SUVs, and luxury electric vehicles across major tier-1 cities like New Delhi, Mumbai, Bengaluru, Chennai, and Kolkata. Starting with mass-market compact vehicles, the newly updated Maruti Suzuki Baleno was released on September 10, 2026, offering petrol and CNG variants priced between ₹5.99 Lakh and ₹9.99 Lakh (ex-showroom). For SUV enthusiasts, the popular Hyundai Creta lineup features newly introduced variants with prices ranging from ₹10.91 Lakh to ₹20.46 Lakh, alongside its newly launched all-electric version, the Hyundai Creta Electric, which starts around ₹20 Lakh. In the mid-size SUV segment, the Mahindra XUV 7XO was launched on September 11, 2026, with a starting price of ₹13.99 Lakh. For premium electric sedan buyers, BMW expanded its line-up with the long-wheelbase BMW i5 LWB, launched on September 7, 2026, carrying a price tag of ₹79.60 Lakh, as well as the flagship BMW i7 facelift introduced on September 11, 2026, with prices ranging from ₹1.95 Crore to ₹2.65 Crore.",
        },
    ],
    text: {
        format: zodTextFormat(VehicleDetails, "vehicle"),
    },
});

const event = response.output_parsed;

console.log(JSON.stringify(event));