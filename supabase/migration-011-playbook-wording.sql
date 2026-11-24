-- migration-011: playbook wording about the company and where it is based.
-- Run once in the SQL editor. Safe to run twice. Only touches the two sentences below.
update public.playbook
   set body = replace(body::text, 'We are based in Egypt and have delivered 1500+ projects for clients in 45+ countries.', 'CULMERA is an international Dutch company headquartered in Dubai, United Arab Emirates, with branches in 15 countries and more than 5,000 employees worldwide. We have delivered 1500+ projects for clients in 45+ countries.')::jsonb
 where key = 'about' and body::text like '%We are based in Egypt and have delivered 1500+ projects for clients in 45+ countries.%';

update public.playbook
   set body = replace(body::text, 'In Egypt. We have delivered 1500+ projects for clients in 45+ countries.', 'Our headquarters is in Dubai, United Arab Emirates, with branches in 15 countries. We deliver our services online and have completed 1500+ projects for clients in 45+ countries.')::jsonb
 where key = 'answers' and body::text like '%In Egypt. We have delivered 1500+ projects for clients in 45+ countries.%';
