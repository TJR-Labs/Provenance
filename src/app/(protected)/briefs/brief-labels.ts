export function formatBriefDomain(domain: string) {
  switch (domain) {
    case "SOFTWARE":
      return "Software";
    case "ML_AI":
      return "ML / AI";
    case "HARDWARE_ROBOTICS":
      return "Hardware / robotics";
    default:
      return domain;
  }
}
