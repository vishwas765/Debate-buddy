// Suggested topics, grouped for browsing. Motions are phrased neutrally so either
// side can be argued. `formats` lists where each topic works best; any topic can
// still be used with any format. MUN agendas carry a suggested committee.
export const CATEGORIES = [
  {id: 'education', label: 'Education'},
  {id: 'technology', label: 'Technology & AI'},
  {id: 'environment', label: 'Environment & Energy'},
  {id: 'economy', label: 'Economy & Work'},
  {id: 'society', label: 'Society & Ethics'},
  {id: 'health', label: 'Health & Science'},
  {id: 'governance', label: 'Law & Governance'},
  {id: 'culture', label: 'Media, Sport & Culture'},
  {id: 'world', label: 'World Affairs (MUN)'}
];

const FA = 'for-against', GD = 'group', MUN = 'mun';
export const TOPICS = [
  // Education
  {text: 'This house would ban homework in primary schools', category: 'education', formats: [FA, GD]},
  {text: 'This house believes that school exams should be replaced by continuous assessment', category: 'education', formats: [FA, GD]},
  {text: 'This house would make coding a compulsory school subject', category: 'education', formats: [FA, GD]},
  {text: 'This house believes that generative AI tools should be allowed in school assignments', category: 'education', formats: [FA, GD]},
  {text: 'This house would make university education free for all', category: 'education', formats: [FA, GD]},
  {text: 'Should students choose their own subjects from age 14?', category: 'education', formats: [GD]},
  {text: 'This house would ban smartphones in schools', category: 'education', formats: [FA, GD]},
  {text: 'How should schools teach financial literacy?', category: 'education', formats: [GD]},

  // Technology & AI
  {text: 'This house believes that the benefits of AI outweigh its risks', category: 'technology', formats: [FA, GD]},
  {text: 'This house would ban social media for users under 16', category: 'technology', formats: [FA, GD]},
  {text: 'This house would require AI-generated content to be clearly labelled', category: 'technology', formats: [FA, GD]},
  {text: 'This house believes that facial recognition should not be used by police', category: 'technology', formats: [FA, GD]},
  {text: 'This house would hold social media platforms legally liable for misinformation', category: 'technology', formats: [FA, GD]},
  {text: 'Is remote work better for society than office work?', category: 'technology', formats: [GD]},
  {text: 'This house would give people a legal right to disconnect from work messages', category: 'technology', formats: [FA, GD]},
  {text: 'How should governments regulate generative AI?', category: 'technology', formats: [GD]},

  // Environment & Energy
  {text: 'This house would ban single-use plastics', category: 'environment', formats: [FA, GD]},
  {text: 'This house believes that nuclear power is essential to fight climate change', category: 'environment', formats: [FA, GD]},
  {text: 'This house would introduce a carbon tax on all imported goods', category: 'environment', formats: [FA, GD]},
  {text: 'This house believes that individuals, not only governments, are responsible for climate action', category: 'environment', formats: [FA, GD]},
  {text: 'This house would ban new petrol and diesel cars by 2035', category: 'environment', formats: [FA, GD]},
  {text: 'How can cities reduce air pollution without hurting livelihoods?', category: 'environment', formats: [GD]},
  {text: 'This house would prioritise economic growth over environmental protection in developing countries', category: 'environment', formats: [FA, GD]},

  // Economy & Work
  {text: 'This house supports a universal basic income', category: 'economy', formats: [FA, GD]},
  {text: 'This house would introduce a four-day working week', category: 'economy', formats: [FA, GD]},
  {text: 'This house believes that cryptocurrency does more harm than good', category: 'economy', formats: [FA, GD]},
  {text: 'This house would tax the gig economy like traditional employment', category: 'economy', formats: [FA, GD]},
  {text: 'This house believes that automation will create more jobs than it destroys', category: 'economy', formats: [FA, GD]},
  {text: 'Should startups be preferred over government jobs as a career path?', category: 'economy', formats: [GD]},
  {text: 'This house would cap executive pay relative to the lowest-paid worker', category: 'economy', formats: [FA, GD]},

  // Society & Ethics
  {text: 'This house believes that celebrities have a duty to be role models', category: 'society', formats: [FA, GD]},
  {text: 'This house would make voting compulsory', category: 'society', formats: [FA, GD]},
  {text: 'This house believes that cancel culture does more harm than good', category: 'society', formats: [FA, GD]},
  {text: 'This house would ban zoos', category: 'society', formats: [FA, GD]},
  {text: 'This house believes that influencers should be licensed to promote products', category: 'society', formats: [FA, GD]},
  {text: 'Is it ethical to eat meat?', category: 'society', formats: [FA, GD]},
  {text: 'What makes a good leader in a student team?', category: 'society', formats: [GD]},
  {text: 'This house would lower the voting age to 16', category: 'society', formats: [FA, GD]},

  // Health & Science
  {text: 'This house would tax sugary drinks', category: 'health', formats: [FA, GD]},
  {text: 'This house would make organ donation opt-out', category: 'health', formats: [FA, GD]},
  {text: 'This house believes that space exploration is worth its cost', category: 'health', formats: [FA, GD]},
  {text: 'This house would allow gene editing to prevent inherited diseases', category: 'health', formats: [FA, GD]},
  {text: 'This house would ban junk food advertising aimed at children', category: 'health', formats: [FA, GD]},
  {text: 'How should schools support student mental health?', category: 'health', formats: [GD]},

  // Law & Governance
  {text: 'This house would abolish the death penalty worldwide', category: 'governance', formats: [FA, GD]},
  {text: 'This house believes that judges should be elected', category: 'governance', formats: [FA, GD]},
  {text: 'This house would introduce term limits for all legislators', category: 'governance', formats: [FA, GD]},
  {text: 'This house believes that whistleblowers should always be protected', category: 'governance', formats: [FA, GD]},
  {text: 'This house would legalise and regulate all gambling', category: 'governance', formats: [FA, GD]},
  {text: 'Should countries hold citizens’ assemblies on major decisions?', category: 'governance', formats: [GD]},

  // Media, Sport & Culture
  {text: 'This house believes that e-sports should be part of the Olympic Games', category: 'culture', formats: [FA, GD]},
  {text: 'This house would ban advertising of betting during sports broadcasts', category: 'culture', formats: [FA, GD]},
  {text: 'This house believes that museums should return artefacts to their countries of origin', category: 'culture', formats: [FA, GD]},
  {text: 'This house believes that reality television does more harm than good', category: 'culture', formats: [FA, GD]},
  {text: 'Does fan culture help or hurt sport?', category: 'culture', formats: [GD]},
  {text: 'This house would require public broadcasters to be fully independent of government funding', category: 'culture', formats: [FA, GD]},

  // World Affairs (MUN)
  {text: 'Regulating lethal autonomous weapons systems', category: 'world', formats: [MUN, FA, GD], committee: 'DISEC (First Committee)'},
  {text: 'Protecting the rights of climate-displaced people', category: 'world', formats: [MUN, GD], committee: 'UNHCR'},
  {text: 'Ensuring equitable access to vaccines in future pandemics', category: 'world', formats: [MUN, GD], committee: 'WHO (World Health Assembly)'},
  {text: 'Governing the use of artificial intelligence in elections', category: 'world', formats: [MUN, GD], committee: 'UN General Assembly'},
  {text: 'Combating plastic pollution in the oceans', category: 'world', formats: [MUN, GD], committee: 'UNEP'},
  {text: 'Addressing the global water crisis', category: 'world', formats: [MUN, GD], committee: 'ECOSOC'},
  {text: 'Reforming the UN Security Council veto', category: 'world', formats: [MUN, FA], committee: 'UN General Assembly'},
  {text: 'Preventing the militarisation of outer space', category: 'world', formats: [MUN, GD], committee: 'DISEC (First Committee)'},
  {text: 'Protecting children’s education in conflict zones', category: 'world', formats: [MUN, GD], committee: 'UNICEF Executive Board'},
  {text: 'Strengthening international cooperation on cybercrime', category: 'world', formats: [MUN, GD], committee: 'UNODC / Third Committee'},
  {text: 'Debt relief for climate-vulnerable developing nations', category: 'world', formats: [MUN, FA], committee: 'ECOFIN (Second Committee)'},
  {text: 'Safeguarding freedom of the press worldwide', category: 'world', formats: [MUN, GD], committee: 'UNESCO'}
];

export const COMMITTEES = ['UN General Assembly', 'UN Security Council', 'DISEC (First Committee)', 'ECOFIN (Second Committee)', 'SOCHUM (Third Committee)', 'SPECPOL (Fourth Committee)', 'Human Rights Council', 'ECOSOC', 'UNEP', 'UNHCR', 'UNICEF Executive Board', 'UNESCO', 'WHO (World Health Assembly)', 'UNODC / Third Committee', 'UN Women', 'IAEA'];

// UN member states plus the two observer states, for the country picker.
export const COUNTRIES = 'Afghanistan,Albania,Algeria,Andorra,Angola,Antigua and Barbuda,Argentina,Armenia,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Brazil,Brunei Darussalam,Bulgaria,Burkina Faso,Burundi,Cabo Verde,Cambodia,Cameroon,Canada,Central African Republic,Chad,Chile,China,Colombia,Comoros,Congo,Costa Rica,Côte d’Ivoire,Croatia,Cuba,Cyprus,Czechia,Democratic People’s Republic of Korea,Democratic Republic of the Congo,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Eswatini,Ethiopia,Fiji,Finland,France,Gabon,Gambia,Georgia,Germany,Ghana,Greece,Grenada,Guatemala,Guinea,Guinea-Bissau,Guyana,Haiti,Honduras,Hungary,Iceland,India,Indonesia,Iran,Iraq,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Kuwait,Kyrgyzstan,Lao People’s Democratic Republic,Latvia,Lebanon,Lesotho,Liberia,Libya,Liechtenstein,Lithuania,Luxembourg,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Mauritania,Mauritius,Mexico,Micronesia,Monaco,Mongolia,Montenegro,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,New Zealand,Nicaragua,Niger,Nigeria,North Macedonia,Norway,Oman,Pakistan,Palau,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Poland,Portugal,Qatar,Republic of Korea,Republic of Moldova,Romania,Russian Federation,Rwanda,Saint Kitts and Nevis,Saint Lucia,Saint Vincent and the Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Sweden,Switzerland,Syrian Arab Republic,Tajikistan,Thailand,Timor-Leste,Togo,Tonga,Trinidad and Tobago,Tunisia,Türkiye,Turkmenistan,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United Republic of Tanzania,United States of America,Uruguay,Uzbekistan,Vanuatu,Venezuela,Viet Nam,Yemen,Zambia,Zimbabwe,Holy See (observer),State of Palestine (observer)'.split(',');

export function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
