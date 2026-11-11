# Terramotos Portugal: the dataset

Every recorded earthquake in mainland Portugal, the Azores and Madeira since 1909, merged from four
catalogues into one list. This is the data behind https://terramotos.com/ and it
is rebuilt from the sources on a schedule, so later downloads include revisions and new events.

Download: https://github.com/andredelgado/terramotos/releases/download/dataset/terramotos-portugal.zip

## Terms of use

The merged catalogue is offered under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): you may share and adapt it for
non-commercial purposes, with attribution. It is non-commercial because IPMA's terms are. Each
record also remains subject to the terms of the source it came from (the `sources` column says
which), and you must credit those sources, not only this project:

| Source | Its terms, as published on its site in November 2026 | How to credit |
|---|---|---|
| [IPMA](https://api.ipma.pt/) | Free to copy and use for personal or public purposes that are neither commercial nor offensive; the source must always be named. | Instituto Português do Mar e da Atmosfera (IPMA), https://www.ipma.pt |
| [ISC Bulletin](https://www.isc.ac.uk/iscbulletin/citing.php) | No licence is stated; data taken from the ISC must always be cited, by academic, commercial and individual users alike. | International Seismological Centre (2026), On-line Bulletin, https://doi.org/10.31905/D808B830 |
| [EMSC](https://www.seismicportal.eu/terms.html) | CC BY 4.0 for data downloaded from its services. | EMSC-CSEM, https://www.emsc-csem.org |
| [USGS](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | U.S. public domain; acknowledgement requested. | U.S. Geological Survey, https://earthquake.usgs.gov |

For anything commercial, or if in doubt, go to the sources themselves.

This is a compilation made by an independent project. It is not an official product of any of
these organisations, and it is not suitable for emergency or safety decisions.

## How records are merged

Two records are the same earthquake when they are within 30 seconds and 100 km of each other
(60 seconds and 250 km before 1964, when locations were rougher). Location and time come from the
first source that has the earthquake, in the order IPMA, ISC, EMSC, USGS. The magnitude is IPMA's
own where IPMA reported one, otherwise a moment magnitude (Mw), otherwise that first source's.

## Columns

| Column | Meaning |
|---|---|
| `id` | Permanent id: the UTC date and a short hash, like `19690228-c63c` |
| `time_utc` | Origin time, UTC |
| `latitude`, `longitude` | Epicentre, decimal degrees |
| `depth_km` | Depth in kilometres; empty when unknown |
| `magnitude`, `mag_type`, `mag_author` | The chosen magnitude, its scale (ML, mb, Ms, Mw, …) and the agency that measured it; empty when none is on record |
| `mw` | A moment magnitude, when any source has one |
| `region` | `continente`, `acores` or `madeira` |
| `place` | Place name as the source gives it |
| `intensity`, `felt` | Felt intensity and whether it was reported felt (IPMA, recent events only) |
| `sources` | The catalogues that have this earthquake, in order of precedence |
| `source_ids` | Each source's own id for it |

## Things to know

- Before the 1960s only large earthquakes were recorded, and most records before 1990 have no magnitude.
- Magnitudes are on mixed scales; use `mw` when you need one scale.
- About 0.5% of events are pairs very close in time and place that the ISC itself lists separately.
- The three regions are coarse outlines that include the surrounding sea, so many events are offshore.
