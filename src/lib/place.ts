/**
 * 📍 Your area, from the ZIP code in Settings (default 45245): the state of a ZIP code and of a US area code,
 * built in and free (no look-up), so checks and searches can say what is near you.
 */

export const DEFAULT_ZIP = '45245';
export const cleanZip = (z: unknown) => (typeof z === 'string' && /^\d{5}$/.test(z.trim()) ? z.trim() : DEFAULT_ZIP);

// First 3 digits of a ZIP code -> state (USPS ranges, "from-to").
const ZIP3: [number, number, string][] = [
  [5, 5, 'New York'], [6, 9, 'Puerto Rico'], [10, 27, 'Massachusetts'], [28, 29, 'Rhode Island'], [30, 38, 'New Hampshire'], [39, 49, 'Maine'],
  [50, 59, 'Vermont'], [60, 69, 'Connecticut'], [70, 89, 'New Jersey'], [100, 149, 'New York'], [150, 196, 'Pennsylvania'], [197, 199, 'Delaware'],
  [200, 200, 'Washington, DC'], [201, 201, 'Virginia'], [202, 205, 'Washington, DC'], [206, 219, 'Maryland'], [220, 246, 'Virginia'], [247, 268, 'West Virginia'],
  [270, 289, 'North Carolina'], [290, 299, 'South Carolina'], [300, 319, 'Georgia'], [320, 349, 'Florida'], [350, 369, 'Alabama'], [370, 385, 'Tennessee'],
  [386, 397, 'Mississippi'], [398, 399, 'Georgia'], [400, 427, 'Kentucky'], [430, 459, 'Ohio'], [460, 479, 'Indiana'], [480, 499, 'Michigan'],
  [500, 528, 'Iowa'], [530, 549, 'Wisconsin'], [550, 567, 'Minnesota'], [569, 569, 'Washington, DC'], [570, 577, 'South Dakota'], [580, 588, 'North Dakota'],
  [590, 599, 'Montana'], [600, 629, 'Illinois'], [630, 658, 'Missouri'], [660, 679, 'Kansas'], [680, 693, 'Nebraska'], [700, 714, 'Louisiana'],
  [716, 729, 'Arkansas'], [730, 732, 'Oklahoma'], [733, 733, 'Texas'], [734, 749, 'Oklahoma'], [750, 799, 'Texas'], [800, 816, 'Colorado'],
  [820, 831, 'Wyoming'], [832, 838, 'Idaho'], [840, 847, 'Utah'], [850, 865, 'Arizona'], [870, 884, 'New Mexico'], [885, 885, 'Texas'],
  [889, 898, 'Nevada'], [900, 961, 'California'], [967, 968, 'Hawaii'], [969, 969, 'Guam'], [970, 979, 'Oregon'], [980, 994, 'Washington'], [995, 999, 'Alaska'],
];
export function zipState(zip: string): string | null {
  const n = Number(zip.slice(0, 3));
  return ZIP3.find(([a, b]) => n >= a && n <= b)?.[2] ?? null;
}

// US area codes -> state (toll-free and non-geographic codes are left out on purpose).
const AREA_LIST: Record<string, string> = {
  Alabama: '205 251 256 334 659 938', Alaska: '907', Arizona: '480 520 602 623 928', Arkansas: '327 479 501 870',
  California: '209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951',
  Colorado: '303 719 720 970 983', Connecticut: '203 475 860 959', Delaware: '302', 'Washington, DC': '202 771',
  Florida: '239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954', Georgia: '229 404 470 478 678 706 762 770 912 943',
  Hawaii: '808', Idaho: '208 986', Illinois: '217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872', Indiana: '219 260 317 463 574 765 812 930',
  Iowa: '319 515 563 641 712', Kansas: '316 620 785 913', Kentucky: '270 364 502 606 859', Louisiana: '225 318 337 504 985', Maine: '207',
  Maryland: '227 240 301 410 443 667', Massachusetts: '339 351 413 508 617 774 781 857 978', Michigan: '231 248 269 313 517 586 616 679 734 810 906 947 989',
  Minnesota: '218 320 507 612 651 763 924 952', Mississippi: '228 601 662 769', Missouri: '235 314 417 557 573 636 660 816 975', Montana: '406',
  Nebraska: '308 402 531', Nevada: '702 725 775', 'New Hampshire': '603', 'New Jersey': '201 551 609 640 732 848 856 862 908 973', 'New Mexico': '505 575',
  'New York': '212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934', 'North Carolina': '252 336 472 704 743 828 910 919 980 984',
  'North Dakota': '701', Ohio: '216 220 234 283 326 330 380 419 436 440 513 567 614 740 937', Oklahoma: '405 539 572 580 918', Oregon: '458 503 541 971',
  Pennsylvania: '215 223 267 272 412 445 484 570 582 610 717 724 814 835 878', 'Rhode Island': '401', 'South Carolina': '803 821 839 843 854 864',
  'South Dakota': '605', Tennessee: '423 615 629 731 865 901 931',
  Texas: '210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979',
  Utah: '385 435 801', Vermont: '802', Virginia: '276 434 540 571 686 703 757 804 826 948', Washington: '206 253 360 425 509 564',
  'West Virginia': '304 681', Wisconsin: '262 274 353 414 534 608 715 920', Wyoming: '307', 'Puerto Rico': '787 939',
};
const AREA: Record<string, string> = Object.fromEntries(Object.entries(AREA_LIST).flatMap(([st, codes]) => codes.split(' ').map((c) => [c, st])));
export const areaState = (code: string) => AREA[code] ?? null;

/** "ZIP 45245 (Ohio)": the words given to the AI. */
export const placeWords = (zip: string) => `ZIP code ${zip}${zipState(zip) ? ` (${zipState(zip)})` : ''}`;
