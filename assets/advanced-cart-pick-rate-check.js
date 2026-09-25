/**
 * Self-check for pickBestRate scoring (mirrors advanced-cart-preview.js).
 * Run: node assets/advanced-cart-pick-rate-check.js
 */
function parseLocation(label) {
  var parts = String(label || "")
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (!parts.length) {
    return { address1: "", city: "", province: "", country: "Oman", zip: "" };
  }
  var country = parts.length > 1 ? parts[parts.length - 1] : "Oman";
  var address1 = parts[0];
  var province = parts.length > 2 ? parts[1] : "";
  var city = parts.length > 2 ? parts[parts.length - 2] : address1;
  if (
    country === "United Arab Emirates" ||
    country === "Kuwait" ||
    country === "Bahrain" ||
    country === "Qatar"
  ) {
    return { address1: address1, city: "N/A", province: address1, country: country, zip: "" };
  }
  return { address1: address1, city: city, province: province, country: country, zip: "" };
}

function pickBestRate(rates, locationText) {
  if (!rates || !rates.length) return null;
  var loc = parseLocation(locationText);
  var needles = [loc.province, loc.city, loc.address1, loc.country]
    .map(function (s) {
      return String(s || "")
        .trim()
        .toLowerCase();
    })
    .filter(function (s) {
      return s.length >= 2 && s !== "n/a";
    });
  var seen = {};
  needles = needles.filter(function (s) {
    if (seen[s]) return false;
    seen[s] = true;
    return true;
  });

  var best = null;
  var bestScore = 0;
  var i;
  for (i = 0; i < rates.length; i++) {
    var rate = rates[i];
    var name = String(rate.name || rate.presentment_name || "").toLowerCase();
    if (!name) continue;
    var score = 0;
    var n;
    for (n = 0; n < needles.length; n++) {
      if (name.indexOf(needles[n]) !== -1 && needles[n].length > score) {
        score = needles[n].length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = rate;
    }
  }
  if (best) return best;

  var cheapest = rates[0];
  for (i = 1; i < rates.length; i++) {
    if (Number(rates[i].price) < Number(cheapest.price)) cheapest = rates[i];
  }
  return cheapest;
}

var rates = [
  { name: "Muscat East Delivery", price: "0.000", description: "Within 24 hours" },
  { name: "Muscat West Delivery", price: "0.000", description: "Within 24 hours" },
  { name: "Oman Delivery", price: "0.000", description: "In 3 Workdays" },
];

var cases = [
  ["Salalah, Dhofar, Oman", "Oman Delivery"],
  ["Al Seeb, Muscat West, Oman", "Muscat West Delivery"],
  ["Ruwi, Muscat East, Oman", "Muscat East Delivery"],
  ["Nizwa, Al Dakhiliyah, Oman", "Oman Delivery"],
  ["Sur, Al Sharqiyah South, Oman", "Oman Delivery"],
  ["Khasab, Musandam, Oman", "Oman Delivery"],
];

var failed = 0;
cases.forEach(function (c) {
  var picked = pickBestRate(rates, c[0]);
  var name = picked && picked.name;
  if (name !== c[1]) {
    failed += 1;
    console.error("FAIL", c[0], "=>", name, "expected", c[1]);
  } else {
    console.log("ok", c[0], "=>", name);
  }
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all passed");
