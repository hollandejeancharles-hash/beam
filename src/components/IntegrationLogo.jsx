import React from "react";
const brands = {ado:"Azure DevOps",slack:"Slack",teams:"Microsoft Teams",confluence:"Confluence",notion:"Notion",github:"GitHub"};
export default function IntegrationLogo({provider}) {
  return brands[provider] ? <img className={`integration-brand-logo ${provider}`} src={`/integration-logos/${provider}.svg`} alt="" aria-hidden="true" /> : <span aria-hidden="true">AD</span>;
}
