// Generated from the Streamlit project data (events.json, missions.json, buildings.json, levels.json).
// Reused as-is: solar storm event + science text, lessons, failure reasons, scoring weights, building descriptions, Moon facts.
export default {
 "solarStorm": {
  "id": "solar_storm",
  "name": "Solar Storm",
  "icon": "☀️",
  "category": "environment",
  "locations": [
   "moon",
   "mars"
  ],
  "min_level": 1,
  "max_level": 100,
  "weight": 1.2,
  "timer_factor": 1.0,
  "on_start": [
   {
    "effects": {
     "status": [
      {
       "id": "solar_storm",
       "days": 2
      }
     ]
    }
   }
  ],
  "alert": "A solar storm has been detected. Radiation levels are expected to rise.",
  "problem": "{crew_location} Radiation will stay high for the next two days. You have limited time to protect the crew.",
  "hint": "Shielding and time outside both change how much radiation each astronaut receives.",
  "choices": [
   {
    "id": "A",
    "text": "Enter the radiation shelter immediately.",
    "grades": [
     {
      "when": {
       "building": "radiation_shelter",
       "state": "working"
      },
      "grade": "perfect",
      "why": "The shelter blocks about 90% of the radiation, so the crew stayed safe."
     },
     {
      "when": {
       "building": "radiation_shelter",
       "state": "missing"
      },
      "grade": "acceptable",
      "why": "You have no radiation shelter, so the crew could only huddle in the habitat core. Building a shelter would have been much safer."
     },
     {
      "grade": "good",
      "why": "Your shelter is damaged, so it protected the crew only partly."
     }
    ],
    "outcomes": {
     "perfect": {
      "move": "all_to_shelter",
      "cancel_tasks": true
     },
     "good": {
      "move": "all_to_shelter",
      "cancel_tasks": true,
      "health": {
       "all": -3
      },
      "dose": {
       "all": 6
      }
     },
     "acceptable": {
      "move": "all_to_shelter",
      "cancel_tasks": true,
      "health": {
       "all": -5
      },
      "dose": {
       "all": 10
      }
     }
    },
    "cost": {
     "energy": 2
    }
   },
   {
    "id": "B",
    "text": "Stop non-essential systems and return to the habitat.",
    "grades": [
     {
      "when": {
       "building": "radiation_shelter",
       "state": "working"
      },
      "grade": "good",
      "why": "Safe, but the radiation shelter would have protected the crew much better than the habitat walls."
     },
     {
      "grade": "perfect",
      "why": "With no working shelter, getting everyone inside the habitat and cutting power loads was the best protection available."
     }
    ],
    "outcomes": {
     "perfect": {
      "move": "outside_to_habitat",
      "status": [
       {
        "id": "reduced_systems",
        "days": 1
       }
      ],
      "health": {
       "outside": -3
      },
      "dose": {
       "all": 4
      }
     },
     "good": {
      "move": "outside_to_habitat",
      "status": [
       {
        "id": "reduced_systems",
        "days": 1
       }
      ],
      "health": {
       "all": -4
      },
      "dose": {
       "all": 8
      }
     }
    }
   },
   {
    "id": "C",
    "text": "Continue the task and finish the work before returning.",
    "grades": [
     {
      "when": {
       "metric": "outside_count",
       "gte": 1
      },
      "grade": "wrong",
      "why": "Astronauts working outside with no shielding took a large dose while finishing the work."
     },
     {
      "grade": "acceptable",
      "why": "Nobody was outside, so continuing cost little - but you chose not to protect the crew from the storm."
     }
    ],
    "outcomes": {
     "wrong": {
      "health": {
       "outside": -16,
       "inside": -6
      },
      "dose": {
       "outside": 24,
       "inside": 10
      },
      "condition": [
       {
        "building": "random",
        "delta": -15
       }
      ]
     },
     "acceptable": {
      "health": {
       "all": -4
      },
      "dose": {
       "all": 8
      }
     }
    }
   },
   {
    "id": "D",
    "text": "Ignore the warning and continue normal operations.",
    "grades": [
     {
      "when": {
       "metric": "level",
       "lte": 2
      },
      "grade": "acceptable",
      "why": "The storm was weak enough at this stage that ignoring it did only mild harm - it would be dangerous on later missions."
     },
     {
      "grade": "wrong",
      "why": "Ignoring a solar storm leaves everyone exposed and electronics unprotected."
     }
    ],
    "outcomes": {
     "acceptable": {
      "health": {
       "all": -5
      },
      "dose": {
       "all": 10
      }
     },
     "wrong": {
      "health": {
       "outside": -22,
       "inside": -9
      },
      "dose": {
       "outside": 30,
       "inside": 14
      },
      "condition": [
       {
        "building": "random",
        "delta": -25
       }
      ]
     }
    }
   }
  ],
  "science": "Solar storms are bursts of energetic particles from the Sun that can raise radiation far above normal. On the Moon and Mars there is little or no atmosphere or global magnetic field to help, so shielding and time outside decide how much radiation astronauts absorb."
 },
 "lessons": [
  {
   "id": "radiation_good",
   "topic": "Radiation",
   "text": "You protected the crew during a solar storm. Shielding and spending less time outside both reduce radiation dose - the same reasons real mission planners build storm shelters and schedule spacewalks carefully.",
   "when": {
    "event": "solar_storm",
    "grade": [
     "perfect",
     "good"
    ]
   }
  },
  {
   "id": "radiation_bad",
   "topic": "Radiation",
   "text": "Solar storms raise radiation sharply. With little or no atmosphere or magnetic field to help, shielding and limiting time outside are the main defences. A shelter would have made a big difference.",
   "when": {
    "event": "solar_storm",
    "grade": [
     "wrong",
     "acceptable"
    ]
   }
  },
  {
   "id": "dose_adds_up",
   "topic": "Radiation",
   "text": "Radiation dose adds up over time. Even a small daily dose can become a problem on a long mission, which is why astronauts have career dose limits.",
   "when": {
    "stat": "dose_fraction",
    "gte": 0.7
   }
  },
  {
   "id": "blackout",
   "topic": "Energy",
   "text": "Your outpost ran short of power. Engineers plan for this with batteries, spare capacity and 'load shedding': switching off the least important systems first so life support stays on.",
   "when": {
    "stat": "blackout_days",
    "gte": 1
   }
  },
  {
   "id": "battery_night",
   "topic": "Energy",
   "text": "The Moon has about two weeks of darkness at a time. Solar power alone cannot get you through the night, so stored energy (batteries) is essential.",
   "when": {
    "all": [
     {
      "stat": "night_days_seen",
      "gte": 1
     },
     {
      "built": "battery",
      "state": "missing"
     }
    ]
   }
  },
  {
   "id": "water_recycling",
   "topic": "Water",
   "text": "Water is heavy and expensive to launch, so space stations recycle most of theirs. Without a recycler your water supply fell dangerously low.",
   "when": {
    "all": [
     {
      "stat": "min_water",
      "lt": 30
     },
     {
      "built": "water_recycler",
      "state": "missing"
     }
    ]
   }
  },
  {
   "id": "oxygen_low",
   "topic": "Life support",
   "text": "Oxygen dropped dangerously low. Plants and electrolysis (splitting water) both make oxygen, but each costs something else - water, energy or materials. That is the core trade-off of life support.",
   "when": {
    "stat": "min_oxygen",
    "lt": 25
   }
  },
  {
   "id": "temperature",
   "topic": "Temperature",
   "text": "The habitat got too hot or cold. With no air outside to carry heat away, spacecraft depend on insulation, heaters and radiators to keep temperatures stable.",
   "when": {
    "stat": "temp_unsafe_days",
    "gte": 1
   }
  },
  {
   "id": "low_gravity",
   "topic": "Gravity and health",
   "text": "Low gravity weakens muscles and bones. Astronauts on the International Space Station exercise about two hours a day to stay healthy - and your crew needed exercise too.",
   "when": {
    "all": [
     {
      "stat": "days",
      "gte": 6
     },
     {
      "built": "exercise_area",
      "state": "missing"
     }
    ]
   }
  },
  {
   "id": "maintenance",
   "topic": "Maintenance",
   "text": "Equipment wore down and was not fully repaired. Spare parts and repair time are a real constraint on long missions, so engineers plan maintenance ahead.",
   "when": {
    "stat": "worn_buildings_end",
    "gte": 1
   }
  },
  {
   "id": "hoarding",
   "topic": "Trade-offs",
   "text": "You finished with lots of unused materials. Reserves are wise for emergencies, but building for the future earlier might have made the mission safer and more efficient.",
   "when": {
    "stat": "materials_fraction_end",
    "gte": 0.6
   }
  },
  {
   "id": "timeouts",
   "topic": "Decisions under pressure",
   "text": "A decision timed out. In real emergencies crews rely on checklists and practice so that good choices come quickly - hesitation is a choice too.",
   "when": {
    "stat": "timeouts",
    "gte": 1
   }
  },
  {
   "id": "dust",
   "topic": "Dust",
   "text": "Dust is a real engineering problem: Apollo astronauts found lunar dust clung to everything and wore out equipment, and Mars dust can coat solar panels and block sunlight.",
   "when": {
    "any": [
     {
      "event": "dust_problem",
      "grade": [
       "wrong",
       "acceptable"
      ]
     },
     {
      "event": "dust_storm",
      "grade": [
       "wrong",
       "acceptable"
      ]
     }
    ]
   }
  },
  {
   "id": "redundancy",
   "topic": "Redundancy",
   "text": "Your life-support systems stayed stable. Engineers get there by building redundancy: backup power, spare parts and more than one way to make air, water and food.",
   "when": {
    "all": [
     {
      "stat": "min_oxygen",
      "gte": 40
     },
     {
      "stat": "min_water",
      "gte": 40
     },
     {
      "stat": "blackout_days",
      "lt": 1
     }
    ]
   }
  },
  {
   "id": "connected",
   "topic": "Systems thinking",
   "text": "Every system is connected: power runs the water recycler, water feeds the greenhouse and the oxygen system, and plants feed the crew. A problem in one place spreads - that is systems engineering.",
   "when": {
    "stat": "days",
    "gte": 1
   }
  }
 ],
 "failureReasons": {
  "health": "An astronaut's health reached a critical level and the mission was aborted for a medical evacuation.",
  "oxygen": "Oxygen ran out and stayed empty - the crew could no longer breathe safely.",
  "water": "Water ran out and stayed empty - the crew became dangerously dehydrated.",
  "objective": "A required mission objective could not be met."
 },
 "scoring": {
  "weights": {
   "crew": 0.2,
   "life_support": 0.4,
   "energy": 0.15,
   "infrastructure": 0.1,
   "efficiency": 0.1,
   "objectives": 0.05
  },
  "labels": {
   "crew": "Crew survival / health",
   "life_support": "Life-support stability",
   "energy": "Energy management",
   "infrastructure": "Infrastructure",
   "efficiency": "Resource efficiency",
   "objectives": "Scientific / mission objectives"
  },
  "stars": {
   "three": 80,
   "two": 60,
   "three_min_health": 50
  },
  "recommended_buildings": [
   "habitat",
   "solar_panels",
   "water_recycler",
   "greenhouse",
   "battery",
   "radiation_shelter"
  ],
  "recommended_extra": {
   "temperature_control": "extreme_temperature",
   "oxygen_generator": "always",
   "exercise_area": "low_gravity"
  }
 },
 "buildings": {
  "habitat": {
   "name": "Habitat",
   "icon": "🏠",
   "description": "Pressurised safe living area. The crew sleeps, eats and recovers here.",
   "benefit": "Required for survival: shields the crew from ~55% of radiation and insulates against temperature swings.",
   "tradeoff": "Uses 6 energy per day for life support. If it loses power, its protection fades.",
   "effects": {
    "shield": 0.55,
    "insulation": 0.6
   },
   "cost": {
    "materials": 15
   }
  },
  "solar_panels": {
   "name": "Solar Panels",
   "icon": "☀️",
   "description": "Photovoltaic array that turns sunlight into electricity.",
   "benefit": "+18 energy per day in full sunlight (nothing at night, less in dust or low light).",
   "tradeoff": "Costs 25 materials, which cannot be spent on life support or shelter. Dust and storms can damage it.",
   "cost": {
    "materials": 25
   }
  },
  "oxygen_generator": {
   "name": "Oxygen System",
   "icon": "🫧",
   "description": "Splits water into oxygen and hydrogen (electrolysis) for breathable air.",
   "benefit": "+7 oxygen per day, stabilising breathable conditions.",
   "tradeoff": "Uses 6 energy and 1.5 water per day - oxygen is traded for power and water.",
   "cost": {
    "materials": 30
   }
  },
  "water_recycler": {
   "name": "Water Recycler",
   "icon": "💧",
   "description": "Cleans used water so it can be drunk again.",
   "benefit": "Restores about 8 water per day - most of what two astronauts use.",
   "tradeoff": "Uses 3 energy per day. Without power it recovers nothing.",
   "cost": {
    "materials": 25
   }
  },
  "radiation_shelter": {
   "name": "Radiation Shelter",
   "icon": "🛡️",
   "description": "Heavily shielded storm cellar for the crew.",
   "benefit": "Astronauts inside receive ~90% less radiation during dangerous periods.",
   "tradeoff": "Costs 40 materials, and astronauts sheltering inside cannot do outside work.",
   "effects": {
    "shield": 0.9
   },
   "cost": {
    "materials": 40
   }
  },
  "rover": {
   "name": "Rover",
   "icon": "🚙",
   "description": "Pressurised-cab rover for hauling samples and exploring further.",
   "benefit": "Surface collection yields 60% more materials per astronaut.",
   "tradeoff": "Uses 4 energy per day, wears out by itself and can break down in the field.",
   "effects": {
    "collect_mult": 1.6
   },
   "cost": {
    "materials": 45
   }
  },
  "comm_array": {
   "name": "Comm Array",
   "icon": "📡",
   "description": "High-gain antenna keeping contact with Mission Control.",
   "benefit": "Mission Control can talk you through emergencies: +25% response time on events.",
   "tradeoff": "Costs materials and energy for a benefit you only feel when something goes wrong.",
   "cost": {
    "materials": 30
   }
  }
 },
 "moon": {
  "facts": [
   "Lunar surface gravity is about 1.62 m/s2, roughly one sixth of Earth's.",
   "Equatorial surface temperatures swing from about +117 C in daylight to about -178 C at night (NASA Moon Fact Sheet).",
   "With no atmosphere or global magnetic field, the surface has no natural radiation shielding."
  ],
  "gravity": 1.62,
  "name": "Moon"
 },
 "rules": {
  "dose_limit": 100,
  "consumption_per_astronaut": {
   "oxygen": 3.5,
   "water": 4.0,
   "food": 3.0
  }
 }
};
